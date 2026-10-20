# AWS Services — What They Are and Why They're Here

This explains every AWS service in the Shipment Tracker: what it does in general,
what it does **in this project**, and the trade-offs behind the choice.

The deployed stack uses **Amazon SQS** as the ingest buffer (`cdk deploy -c ingest=sqs`), because the
AWS Free plan does not include Kinesis. The same stack can deploy **Kinesis** instead (no flag); the
`process_event` Lambda handles both. Section ② explains the choice.

```
 Truck (simulator.py)
   │  MQTT over TLS, X.509 client certificate
   ▼
 ① AWS IoT Core ──(rule: SELECT * FROM 'shipments/+/location')──┐
   │                                                           │ on error
   ▼                                                           ▼
 ② Amazon SQS  ingest queue ───(after 4 failed receives)──► ⑥ Amazon SQS (DLQ)
   │  batch of ≤10 messages, no batching window                ▲
   ▼                                                           │ invalid
 ③ AWS Lambda  process_event ──────────────────────────────────┘
   │  conditional UpdateItem (only if newer seq)
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
- **Topic rule** `shipment_location_to_sqs_<stage>`: forwards every message to the SQS
  ingest queue (in the Kinesis variant: `shipment_location_to_kinesis_<stage>`, partition key =
  shipment ID). If that write fails, the rule's **error action** sends the message to the
  DLQ, so nothing is lost silently.

**Why not HTTP to API Gateway?** MQTT is built for devices on flaky networks. It has a
small overhead, a persistent connection, QoS 1 delivery guarantees, and certificate
authentication. Real telematics boxes speak MQTT.

**Cost (Frankfurt list prices):** $1.20 per million messages + $0.18 per million rules triggered
+ $0.18 per million actions ≈ $1.56 per million. At 40 trucks × 1 msg/30 s that's ~115k
messages/day ≈ $0.18/day; in fast demo mode (every 3 s) ≈ $1.80/day.

---

## ② Amazon SQS — ingest queue (buffer between IoT Core and Lambda)

**In general:** A fully managed message queue. Producers send messages, consumers receive
and then delete them. A standard queue has practically unlimited throughput, delivers
*at least once* and does not guarantee order.

**Here:** queue `shipment-location-ingest-<stage>`, encrypted (SQS-managed key), TLS enforced.

| Setting | Value | Why |
|---|---|---|
| Lambda batch size | 10, **no batching window** | with a 1 s window, messages waited ~10 s in the queue (measured: p50 9.3 s); without it ~0.3 s |
| Visibility timeout | 180 s | 6 × the Lambda timeout, so a message is not handed out twice while it's being processed |
| Redrive policy | 4 receives → DLQ | a message that keeps failing ends up in the DLQ instead of looping forever |
| Retention | 24 h | stale GPS is useless after a day |

**Why a queue between IoT Core and Lambda at all?** IoT rules can invoke Lambda directly,
but then there is no buffer. Measured on AWS:
- The 30-day backfill peaked at **4,660 messages/min** with 0 errors.
- This account allows only **10 concurrent Lambda executions**. 2,515 deliveries were
  throttled; SQS kept them and redelivered them. **Nothing was lost**, the DLQ stayed at 0.

**Why SQS and not Kinesis (the design in the 1-pager)?**

| | SQS standard (deployed) | Kinesis, 1 provisioned shard |
|---|---|---|
| Idle cost | $0, billed per request ($0.40 per million) | $0.018/shard-hour = **$0.43/day**, also when idle |
| Order per truck | no — not needed: the `seq` check makes the result order-independent (tested) | yes (partition key = shipment) |
| Replay after a bad deploy | no — only what landed in the DLQ | 24 h |
| Several consumers | no (one queue, one reader) | yes (e.g. Firehose → S3 → Athena) |
| Capacity | no practical limit; Lambda scales to 1,250 concurrent readers | 1 MB/s per shard ≈ 17,000 trucks at 30 s |
| AWS Free plan | yes | no |

**Decision:** SQS for this workload. Switch to Kinesis (deploy without `-c ingest=sqs`) once
replay or a second consumer is needed. The Lambda code stays the same; in that variant the
event source uses batches of 100, a 1 s window, bisect-on-error, 3 retries and a 1 h max record age.

---

## ③ AWS Lambda — compute

**In general:** Runs your function in response to events. There are no servers, and you pay
per request and per GB-second of runtime. It scales automatically.

**Here:** three Python 3.12 functions on **ARM/Graviton** (≈20% cheaper than x86):

| Function | Trigger | Job |
|---|---|---|
| `process_event` | SQS ingest queue (event source mapping) | Validate telemetry → append milestones to the events table → upsert the shipment's current state |
| `api` | API Gateway `GET` | Live board, shipment detail + timeline, and `/metrics` (on-time %, ETA accuracy, CO₂e, lanes, customers) |
| `update_shipment` | API Gateway `PUT` | Set or clear the operator's manual delay flag |

**Production-grade details in `process_event`:**
- **Idempotency:** every message has a per-shipment sequence number, and writes use
  `ConditionExpression: seq < :new_seq`. Duplicates (MQTT QoS 1 and SQS are both "at least
  once") and out-of-order messages (a standard queue doesn't keep order) are skipped. Event rows are keyed by their own time and sequence, so a replay just overwrites them.
- **Partial batch failures:** the handler returns `batchItemFailures`, so only the failed
  messages go back to the queue; the rest of the batch is deleted.
- **Retries:** a failed message becomes visible again after the 180 s visibility timeout;
  after 4 receives the queue moves it to the DLQ. (Kinesis variant: bisect on error, 3 retries,
  max record age 1 h.)
- **Poison records** (invalid JSON, bad coordinates) go straight to the DLQ.
  Retrying them would never help.
- **Ownership split:** it uses `UpdateItem` on telemetry fields only, so an operator's
  flag isn't wiped by the next GPS ping.
- **ETA accuracy capture:** the ETA seen when a truck passes halfway (50–65 % of the route) is
  stored with a conditional write where the **lowest `seq` wins**, so arrival order doesn't
  matter. The metrics compare it with the real delivery time (see `docs/METRICS.md`).

**Cost:** ARM $0.20 per million requests + per GB-second; the free tier covers 1M requests and
400,000 GB-s per month. Measured on this deployment: `process_event` handles ≈ 2 messages per
invocation; the `api` function (512 MB, ~2 s per call because it scans the table) uses far more
GB-seconds than ingestion.

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

**In general:** A queue that holds messages that could not be processed, so they can be
inspected and replayed instead of being lost.

**Here:** `shipment-process-event-dlq-<stage>` (14-day retention, encrypted, TLS enforced) collects:
1. IoT messages the rule couldn't put into the ingest queue (rule error action)
2. Invalid GPS payloads rejected by `process_event`, with the reason (e.g. `missing/invalid seq`)
3. Messages that failed 4 times (redrive policy of the ingest queue);
   in the Kinesis variant: batch pointers whose retries were exhausted

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
| `process_event` | `dynamodb:UpdateItem` on Shipments, `PutItem`/`BatchWriteItem` on ShipmentEvents, `sqs:SendMessage` to the DLQ, receive/delete on the ingest queue |
| `api` | `dynamodb:GetItem`, `Scan` on Shipments, `Query` on ShipmentEvents (read-only) |
| `update_shipment` | `dynamodb:UpdateItem` only |
| IoT rule role | `sqs:SendMessage` on the ingest queue only (Kinesis variant: `kinesis:PutRecord(s)` on the stream) |
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
  | Ingest lag | oldest message in the ingest queue > 30 s, for 3 min (latency target broken) |
  | API 5xx | ≥5 server errors in 5 min |
- **Dashboard** `ShipmentTracker-<stage>`: messages into SQS, consumer lag (age of the oldest message), DLQ depth,
  Lambda errors, API p95 latency, 4xx/5xx. Good to show during the demo.
- **X-Ray:** traces a request through API Gateway → Lambda → DynamoDB.

---

## ⑩ AWS Budgets — cost guardrail

As recommended in lab 1: a monthly budget (default **$10**) that emails you at **50%**
and **80%** actual spend, and when **forecasted** spend exceeds 100%. It's created when
you pass `-c alertEmail=…`. Budgets are account-wide, so they track your credits.

A second, account-wide budget `project-budget` ($100, the course limit) alerts at 5 % and 50 %.

**Cost per day** (eu-central-1 list prices, 40 trucks every 30 s = 115k messages):

| Item | Cost / day |
|---|---|
| DynamoDB writes (~2.7 write units per message, $0.7625 per million) | $0.24 |
| IoT Core (message + rule + action) | $0.18 |
| SQS (send + receive + delete, ~2 requests per message, $0.40 per million) | $0.10 |
| Lambda, API Gateway, S3, CloudFront, SNS | ~$0.03 (mostly free tier) |
| CloudWatch (4 alarms, 1 dashboard) | ~$0.10/alarm/month; the dashboard is within the free tier (3 per account) |
| **Pipeline total, no fixed cost** | **≈ $0.55** |
| Each open dashboard tab (table scan every 2 s, $0.1525 per million reads) | ~$0.11 per hour |
| *Kinesis variant: 1 shard* | *+ $0.43, also when idle* |

**Measured:** first AWS run 29k messages ≈ $0.25; current deployment (from 19 Oct 2026) 48k messages,
1.85 M read vs. 0.12 M write units ≈ $0.65, two-thirds of it dashboard reads. Billed: $0 (Free plan
credits). Cost Explorer has no data for a new account, so these are CloudWatch usage × list prices.

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
| **Reliability** | SQS buffering and redelivery (2,515 throttled deliveries, 0 lost), idempotent writes, partial-batch retries, redrive → DLQ + alarm, PITR in prod; tested with injected faults (302/302) |
| **Performance efficiency** | Serverless auto-scaling, batching (≤ 10 messages, no window → p50 0.83 s), Graviton, CDN for the frontend |
| **Cost optimization** | Pay per use everywhere, nothing billed per hour; SQS instead of a Kinesis shard; on-demand DynamoDB; TTL cleanup; Budgets alerts; one-command teardown |
| **Sustainability** | Graviton (more perf/watt), no idle servers or shards, 24 h queue retention, TTL instead of indefinite storage |

---

## Tenancy: what's needed before selling this

The customer portal filters by `customerId`. That's a **filter, not a security boundary**: anyone
who calls the read API can pass any customer ID. Before real shippers log in:

1. Add an **Amazon Cognito** user pool, with a `custom:customerId` attribute per shipper user.
2. Put a **Cognito authorizer** on the API. The `api` Lambda then reads `customerId` from the
   token claims (`requestContext.authorizer.claims`) instead of the query string.
3. Keep public tracking links working with an unguessable token per shipment, not the plain ID.
