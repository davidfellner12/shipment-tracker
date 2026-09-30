# AWS Services — What They Are and Why They're Here

This explains every AWS service in the Shipment Tracker: what it does in general,
what it does **in this project**, and the trade-offs behind the choice.

```
 Truck (simulator.py)
   │  MQTT over TLS, X.509 client certificate
   ▼
 ① AWS IoT Core ──(rule: SELECT * FROM 'shipments/+/location')──┐
   │                                                           │ on error
   ▼                                                           ▼
 ② Amazon Kinesis Data Streams                          ⑥ Amazon SQS (DLQ)
   │  batch of ≤100 records, ≤1 s window                       ▲
   ▼                                                           │ invalid / failed
 ③ AWS Lambda  process_event ──────────────────────────────────┘
   │  conditional UpdateItem (only if newer timestamp)
   ▼
 ④ Amazon DynamoDB  Shipments (state) + ShipmentEvents (timeline)
   ▲
   │  GetItem / Scan               UpdateItem (manual delay)
 ③ Lambda api (read + /metrics) ③ Lambda update_shipment
   ▲                               ▲
   │ GET (public)                  │ PUT (API key)
 ⑤ Amazon API Gateway (REST)  ─────┘
   ▲
   │  fetch every 2 s
 ⑦ Amazon CloudFront ← Amazon S3  (React dashboard + config.json)

 Around it: ⑧ IAM · ⑨ CloudWatch + X-Ray + SNS · ⑩ AWS Budgets · ⑪ CDK / CloudFormation
```

---

## ① AWS IoT Core — device gateway

**In general:** A managed MQTT broker for millions of devices. Devices authenticate
with X.509 certificates (mutual TLS) and publish to topics. A **rules engine** runs
SQL over incoming messages and forwards them to other AWS services.

**Here:**
- The simulator acts as a fleet of 40 trucks and publishes JSON telemetry to `shipments/<id>/location`
  every 30 s in real time (or every 3 s in fast-forward demo mode). Each message carries position, speed, reefer temperature, driver hours, CO₂e totals,
  and any new milestones (border crossed, customs hold, break, delivered, …).
- **Device authentication:** `scripts/provision_device.py` asks IoT Core to create a
  certificate and key pair. The private key goes to `simulator/certs/` and never
  reaches CloudFormation or git.
- **Device policy** (`SimulatorDevicePolicy`): the certificate may **only** connect as
  `shipment-simulator-*` and **only** publish to `shipments/*/location`. A stolen
  certificate can't read data or publish to other topics.
- **Topic rule** `shipment_location_to_kinesis`: forwards every message to Kinesis,
  with partition key = shipment ID from the topic. If the Kinesis write fails, the
  rule's **error action** sends the message to the SQS DLQ, so nothing is lost silently.

**Why not HTTP to API Gateway?** MQTT is built for devices on flaky networks. It has a
small overhead, a persistent connection, QoS 1 delivery guarantees, and certificate
authentication. Real telematics boxes speak MQTT.

**Cost:** ~$1 per million messages + connection minutes. At 40 trucks × 1 msg/30 s that's
~115k messages/day ≈ $0.12/day; in fast demo mode (every 3 s) ≈ $1.15/day.

---

## ② Amazon Kinesis Data Streams — event buffer

**In general:** An ordered, replayable log of records, split into **shards** (each
1 MB/s or 1,000 records/s in). Consumers read at their own pace. Records are kept
for 24 h to 365 days.

**Here:** 1 shard, 24 h retention, encrypted with KMS.

**Why put it between IoT and Lambda?**
| Benefit | Meaning for us |
|---|---|
| Buffering | A burst of pings doesn't overload Lambda/DynamoDB; Lambda drains it in batches |
| Ordering | Same shipment → same partition key → same shard → processed in order |
| Replay | Fix a bug in the Lambda and re-read the last 24 h of events |
| Fan-out | An analytics consumer (Firehose → S3 → Athena) can be added without touching the pipeline |

**Trade-off:** a shard costs ~$0.015/h (~$11/month) even when idle. **This is the
biggest line item, so run `cdk destroy` after the demo.** On-demand mode would scale
automatically but has a higher baseline cost.

---

## ③ AWS Lambda — compute

**In general:** Runs your function in response to events. There are no servers, and you pay
per request and per GB-second of runtime. It scales automatically.

**Here:** three Python 3.12 functions on **ARM/Graviton** (≈20% cheaper than x86):

| Function | Trigger | Job |
|---|---|---|
| `process_event` | Kinesis (event source mapping) | Validate telemetry → append milestones to the events table → upsert the shipment's current state |
| `api` | API Gateway `GET` | Live board, shipment detail + timeline, and `/metrics` (on-time %, ETA accuracy, CO₂e, lanes, customers) |
| `update_shipment` | API Gateway `PUT` | Set or clear the operator's manual delay flag |

**Production-grade details in `process_event`:**
- **Idempotency:** every message has a per-shipment sequence number, and writes use
  `ConditionExpression: seq < :new_seq`. Duplicates (MQTT QoS 1 is "at least once") and
  out-of-order messages are skipped. Event rows are keyed by their own time and sequence, so a replay just overwrites them.
- **Partial batch failures:** the handler returns `batchItemFailures`, so Lambda
  retries only from the failing record instead of the whole batch.
- **Bisect on error + 3 retries + max record age 1 h:** a bad record can't block the
  shard forever. After the retries, the batch metadata goes to the DLQ.
- **Poison records** (invalid JSON, bad coordinates) go straight to the DLQ.
  Retrying them would never help.
- **Ownership split:** it uses `UpdateItem` on telemetry fields only, so an operator's
  flag isn't wiped by the next GPS ping.
- **ETA accuracy capture:** the ETA seen when a truck passes halfway is stored once
  (`if_not_exists`). The metrics compare it with the real delivery time.

**Cost:** 1M requests free per month (free tier). The whole PoC stays well within that.

---

## ④ Amazon DynamoDB — live state store

**In general:** A serverless key-value/document NoSQL database with single-digit ms
latency at any scale. There are no connections, pools, or patching.

**Here:** two tables.
- `Shipments-<stage>` (key `shipmentId`): one item per shipment with its **current** state:
  position, status, ETA vs. plan, cargo, parties, documents, CO₂e and cost totals.
  Delivered shipments stay for 90 days, which is what the KPIs are computed from.
- `ShipmentEvents-<stage>` (key `shipmentId` + sort key `time#seq`): the milestone
  timeline. One `Query` returns it in order.
- **On-demand billing:** pay per read/write, with no capacity planning.
- **TTL:** stale in-transit items expire after 7 days, delivered ones after 90 days, for free.
- **Scaling note:** `/metrics` scans the table. That's fine for a few thousand items; at
  larger scale you'd add a GSI on `(customerId, deliveredAt)` and pre-aggregate daily KPIs.
- **Encryption at rest:** AWS-managed key.
- **Point-in-time recovery + RETAIN** in the `prod` stage. In `dev` the table is
  deleted with the stack for cheap teardown.

**Why not RDS/PostgreSQL?** The access pattern is "get by ID / list all". That needs
no joins and a sub-10 ms latency, and DynamoDB costs nothing at idle. A relational DB would
cost ~$15+/month even idle and needs a VPC.

---

## ⑤ Amazon API Gateway (REST) — the public API

**In general:** A managed HTTP front door. It handles TLS, throttling, auth, request
validation, CORS, API keys and usage plans, then forwards to Lambda.

**Here:**
| Route | Auth | Purpose |
|---|---|---|
| `GET /shipments?customerId=&scope=` | public | Live board or 30-day delivery history |
| `GET /shipments/{id}` | public | Shipment + milestone timeline |
| `GET /metrics?customerId=&days=` | public | KPIs, daily series, lanes, customers, CO₂e, delay causes |
| `PUT /shipments/{id}` | **API key** | Operator marks or clears a delay |

- **API key + usage plan:** the write key has its own throttle (5 req/s) and a daily
  quota. The key is **not** in the website bundle. The operator pastes it once per
  browser session.
- **Request validation:** the `PUT` body is checked against a JSON Schema before the
  Lambda runs, so malformed requests cost nothing.
- **Stage throttling** (50 req/s), **access logs**, **X-Ray tracing** and a **CORS
  allow-list** (CloudFront domain + localhost, not `*`).
- **Polling vs WebSockets:** polling every 2 s + a pipeline of ~1–2 s gives < 5 s
  end-to-end. That meets the target without a WebSocket connection table.

**Next step for real multi-user production:** replace the API key with an **Amazon
Cognito** user pool authorizer, so each dispatcher logs in and actions are auditable per user.

---

## ⑥ Amazon SQS — dead-letter queue

**In general:** A fully managed message queue.

**Here:** one DLQ (14-day retention, encrypted, TLS enforced) that collects:
1. IoT messages the rule couldn't put into Kinesis
2. Invalid GPS payloads rejected by `process_event`
3. Kinesis batch pointers whose retries were exhausted

A CloudWatch alarm fires as soon as the queue holds **one** message.

---

## ⑦ Amazon S3 + Amazon CloudFront — dashboard hosting

**In general:** S3 stores files. CloudFront is AWS's CDN with 400+ edge locations,
HTTPS, and caching.

**Here:**
- The React build (`dashboard/dist`) is uploaded to a **private** S3 bucket. Only
  CloudFront can read it, through **Origin Access Control**.
- CloudFront serves it over HTTPS with security headers (HSTS, X-Frame-Options, …)
  and a SPA fallback to `index.html`.
- CDK writes a `config.json` next to the site with the API URL. The **same build
  works in every stage**, and no URL is hard-coded at build time.

**Why not AWS Amplify (as in the 1-pager)?** Amplify Hosting would also work, but it
needs a Git connection or a manual upload outside CDK. S3 + CloudFront keeps
**everything in one `cdk deploy`**, with no clicks in the console. It's the same
technology Amplify Hosting uses underneath.

---

## ⑧ AWS IAM — least-privilege permissions

Every component gets its own role with only what it needs:

| Principal | Allowed |
|---|---|
| `process_event` | `dynamodb:UpdateItem` on Shipments, `PutItem`/`BatchWriteItem` on ShipmentEvents, `sqs:SendMessage` to the DLQ, read the stream |
| `api` | `dynamodb:GetItem`, `Scan` on Shipments, `Query` on ShipmentEvents (read-only) |
| `update_shipment` | `dynamodb:UpdateItem` only |
| IoT rule role | `kinesis:PutRecord(s)` on this stream only |
| IoT error role | `sqs:SendMessage` on the DLQ only |
| Device certificate | `iot:Connect` as `shipment-simulator-*`, `iot:Publish` to `shipments/*/location` |

No function has `*` permissions or can delete data.

---

## ⑨ Amazon CloudWatch, AWS X-Ray and Amazon SNS — observability

- **Logs:** structured JSON logs for every Lambda, kept for 14 days, plus API
  access logs.
- **Alarms → SNS email:**
  | Alarm | Fires when |
  |---|---|
  | DLQ not empty | ≥1 message in the DLQ |
  | process_event errors | any Lambda error in 5 min |
  | Stream lag | consumer > 30 s behind for 3 min (latency target broken) |
  | API 5xx | ≥5 server errors in 5 min |
- **Dashboard** `ShipmentTracker-<stage>`: incoming records, consumer lag, DLQ depth,
  Lambda errors, API p95 latency, 4xx/5xx. Good to show during the demo.
- **X-Ray:** traces a request through API Gateway → Lambda → DynamoDB.

---

## ⑩ AWS Budgets — cost guardrail

As recommended in lab 1: a monthly budget (default **$10**) that emails you at **50%**
and **80%** actual spend, and when **forecasted** spend exceeds 100%. It's created when
you pass `-c alertEmail=…`. Budgets are account-wide, so they track your credits.

**Expected PoC cost** (eu-central-1, a few hours of demo):
| Item | Cost |
|---|---|
| Kinesis shard | $0.015/h → ~$0.36/day deployed |
| IoT messages | ~$0.12/day real time, ~$1.15/day in fast demo mode |
| Lambda, DynamoDB, API GW, S3, CloudFront, SQS, SNS | free tier / cents |
| CloudWatch (4 alarms, 1 dashboard) | ~$0.10/alarm/month; the dashboard is within the free tier (3 per account) |
| **Total for a 1-week PoC** | **≈ $3–5** |

---

## ⑪ AWS CDK and AWS CloudFormation — infrastructure as code

**CDK** lets you define infrastructure in Python (`infrastructure/stack.py`). `cdk
synth` turns it into a **CloudFormation** template, and `cdk deploy` makes AWS create,
update, or roll back all resources as one unit.

- **Stages:** `-c stage=dev` (default; everything is deleted on destroy) or
  `-c stage=prod` (data retained, PITR on). Resource names include the stage, so
  both can live in one account.
- **Tests:** `tests/test_stack.py` asserts security properties on the synthesized
  template (API key on PUT, encryption, least-privilege IoT policy, DLQ wiring). A
  refactor can't silently remove them.

---

## Well-Architected mapping

| Pillar | How it's addressed |
|---|---|
| **Operational excellence** | All IaC, CI (tests + synth), structured logs, dashboard, alarms |
| **Security** | mTLS device certs, least-privilege IAM and IoT policy, API key on writes, request validation, CORS allow-list, encryption at rest and in transit, private S3 via OAC, no secrets in git |
| **Reliability** | Kinesis buffering and replay, idempotent writes, partial-batch retries, bisect, DLQ + alarm, PITR in prod |
| **Performance efficiency** | Serverless auto-scaling, batching (100 records / 1 s window), Graviton, CDN for the frontend |
| **Cost optimization** | Pay per use everywhere except the shard; on-demand DynamoDB; TTL cleanup; Budgets alerts; one-command teardown |
| **Sustainability** | Graviton (more perf/watt), no idle servers, 24 h retention instead of indefinite storage |

---

## Tenancy: what's needed before selling this

The customer portal filters by `customerId`. That's a **filter, not a security boundary**: anyone
who calls the read API can pass any customer ID. Before real shippers log in:

1. Add an **Amazon Cognito** user pool, with a `custom:customerId` attribute per shipper user.
2. Put a **Cognito authorizer** on the API. The `api` Lambda then reads `customerId` from the
   token claims (`requestContext.authorizer.claims`) instead of the query string.
3. Keep public tracking links working with an unguessable token per shipment, not the plain ID.
