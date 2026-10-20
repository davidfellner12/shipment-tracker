# DynamoDB vs. RDS — Why DynamoDB, What It Costs, How It Scales

**Short answer:** the app always reads and writes *one shipment by its ID*, the load is small and
bursty, and the PoC had to stay under $5. DynamoDB on-demand does exactly that, costs nothing while idle,
and works with Lambda without a VPC or connection pool. RDS would run (and bill) 24/7, and its strength,
flexible SQL queries, is only needed for the analytics page.
At very large, **steady** load, the raw price tips the other way; the fix there is DynamoDB *provisioned*
capacity, not a switch to RDS (see [Cost at scale](#3-cost-at-scale)).

All prices: AWS list prices for **eu-central-1 (Frankfurt)**, queried from the AWS Pricing API on 20 Oct 2026.

---

## 1. What the two services are

| | Amazon DynamoDB | Amazon RDS (PostgreSQL) |
|---|---|---|
| Model | key-value / document store | relational database (tables, SQL, joins) |
| How it runs | fully managed service, no instance | a database **server you rent** (instance size chosen by you) |
| Billing | **per read/write** (on-demand) or per reserved capacity (provisioned) | **per hour** the instance runs + storage, whether used or not |
| Access from Lambda | HTTPS API call, IAM-authorized | TCP connection with username/password, inside a VPC |
| Scaling | automatic, partitions split by itself | vertical (bigger instance) + read replicas; writes = one instance |
| Availability | 3 Availability Zones, built in | single AZ, or Multi-AZ standby at **2× the price** |

**Analogy:** DynamoDB is a locker system — each shipment has a numbered locker; you pay per opening.
RDS is a rented office with a filing clerk who can answer any question — paid by the hour, open or not.

---

## 2. Why DynamoDB fits this project

### 2.1 The access pattern is key-value

Every operation on the hot path addresses one shipment by its ID:

| What happens | Frequency | DynamoDB operation |
|---|---|---|
| Truck sends a position | 80 / min (40 trucks) | `UpdateItem` on `shipmentId`, only if `seq` is newer |
| New milestone (border, delivery, …) | ~0.2 per message | `PutItem` with key `shipmentId` + `time#seq` |
| Operator opens a shipment | on click | `GetItem` + one `Query` for the timeline |
| Operator flags a shipment | rare | `UpdateItem` |
| Dashboard list + KPIs | every 2 s / 15 s per tab | `Scan` ← **the one non-key-value access** |

No joins, no transactions across tables, no ad-hoc queries. SQL's strength isn't used on the write path.

### 2.2 The load is small and bursty

| Measured | Value |
|---|---|
| Messages during live operation | 80 / min (1.3 / s) |
| Backfill peak | 4,660 / min |
| `process_event` time per batch | ~61 ms (1,413 s over 23,246 invocations) |
| Compute busy time under full live load | ~51 min / day = **~3.5 %** |
| Hours without any message since the redeploy | ~20 h (simulator off) |

An RDS instance would be sized for the peak and sit ~96 % idle even while the fleet drives.

### 2.3 The constraints from the 1-pager

| Requirement | DynamoDB | RDS |
|---|---|---|
| **< $5 for the whole PoC** | ≈ $0.37 in the current deployment (writes $0.09, dashboard reads $0.28) | smallest instance alone ≈ $14 / month + VPC access ≈ $38 / month |
| **< 5 s latency** | single-digit ms per write, no connection setup | fast too, but needs a connection pool (RDS Proxy) for Lambda bursts |
| **Serverless, one CDK stack, off when unused** | nothing to size, patch or switch off | instance, VPC, subnets, security groups, credentials, upgrades |

### 2.4 Features the app needs, built in

| Need | DynamoDB | RDS |
|---|---|---|
| Idempotent writes (exactly-once effect) | `ConditionExpression: seq < :newseq` | `UPDATE … WHERE seq < ?` — **tie** |
| Delete old shipments (7 d in transit, 90 d delivered) | **TTL**, free | scheduled cleanup job |
| Encryption, backups, patching | managed | managed (patch windows, major upgrades are yours) |
| Auth from Lambda | IAM role, no secret | DB credentials in Secrets Manager ($0.40 / secret / month) |

### 2.5 Where RDS is genuinely better

| | Why |
|---|---|
| **Analytics** | `/metrics` scans the table and aggregates in Python (~2–4 s). In SQL: one `GROUP BY` with an index |
| **Ad-hoc questions** | "late deliveries of customer X on lane Y in March" — trivial in SQL, needs an index design in DynamoDB |
| **Reads at scale** | a scan costs per KB read; an RDS query costs nothing extra within the instance's capacity |

---

## 3. Cost at scale

### Assumptions

- Every truck reports every **30 s** → 2,880 messages / truck / day, ~87,600 / month (730 h).
- DynamoDB: **2.7 write units per message** (measured: 0.12 M WRU for 48k messages incl. milestones).
- DynamoDB provisioned: capacity = average load ÷ 0.7 (auto-scaling target 70 %).
- RDS instance sized for the write rate (~1.2 writes per message); estimate, not load-tested.
- **Database only**: IoT Core, SQS and Lambda cost the same in both designs and are left out.
- **Without dashboard reads** — they depend on viewers and are covered in section 4.
- Storage stays < 25 GB at every size (TTL), so it's covered by the DynamoDB free tier and ≈ $3 on RDS.

### Prices used

| Item | Frankfurt list price |
|---|---|
| DynamoDB on-demand write / read | $0.7625 / $0.1525 per million units |
| DynamoDB provisioned write / read | $0.000793 / $0.0001586 per unit-hour |
| DynamoDB storage | $0.306 / GB-month (first 25 GB free) |
| RDS PostgreSQL db.t4g.micro / t4g.medium | $0.019 / $0.074 per hour (Multi-AZ: ×2) |
| RDS PostgreSQL db.r6g.large / xlarge / 2xlarge | $0.274 / $0.549 / $1.097 per hour (Multi-AZ: ×2) |
| RDS gp3 storage | $0.137 / GB-month (Multi-AZ: $0.274) |
| RDS Proxy | $0.018 per vCPU-hour (min. 2 vCPU) |
| Aurora Serverless v2 | $0.14 per ACU-hour |
| NAT Gateway (Lambda in the VPC reaching SQS etc.) | $0.052 / hour + $0.052 / GB |

### Monthly database cost by fleet size

| Fleet | Msgs / s | DynamoDB on-demand | DynamoDB provisioned | RDS single-AZ¹ | RDS Multi-AZ¹ (production) |
|---|---|---|---|---|---|
| **0 (idle)** | 0 | **≈ $0** | ≈ $1 (min. capacity) | ≈ $81 | ≈ $97 |
| **40 (this PoC)** | 1.3 | **≈ $7** | ≈ $3 | ≈ $81 (t4g.micro) | ≈ $97 |
| **400** | 13 | ≈ $72 | ≈ $30 | ≈ $121 (t4g.medium) | ≈ $178 |
| **4,000** | 133 | ≈ $720 | ≈ $300 | ≈ $267 (r6g.large) | ≈ $470 |
| **40,000** | 1,333 | ≈ $7,200 | ≈ $3,000 | ≈ $950 (r6g.2xlarge)² | ≈ $1,750² |

¹ Instance + 20 GB storage + NAT Gateway ($38) + RDS Proxy ($0.018 per vCPU-hour, min. 2 vCPU: $26; r6g.2xlarge 8 vCPU: $105). ² Plus provisioned IOPS and
tuning (vacuum, partitioning); one writer instance is close to its limit here.

**Aurora Serverless v2** sits in between: from 0.5 ACU = $51 / month. It can pause at 0 ACU, but a fleet
reporting every 30 s never lets it pause, and resuming takes seconds.

### What the table says

| Fleet size | Cheapest | Why |
|---|---|---|
| idle / PoC / up to a few hundred trucks | **DynamoDB on-demand** | RDS pays ~$80–100 / month for capacity that is 96 % unused |
| a few hundred to a few thousand, steady | **DynamoDB provisioned** | steady load → reserving capacity is ~2.4× cheaper than on-demand |
| tens of thousands, constant | **RDS / Aurora** on raw price | a big instance at full utilization beats per-request pricing |

**The crossover is about utilization, not about the database.** Per-request pricing wins while the load is
low or bursty; per-hour pricing wins once the capacity is used around the clock. DynamoDB covers both
with its two capacity modes; only at very high constant load does a relational instance become cheaper —
and then it needs Multi-AZ, sharding and tuning that DynamoDB does by itself.

**Cheaper DynamoDB writes at scale:** the state item is ~1.4 KB, so every position update costs 2 write
units. Splitting the hot fields (position, status, ETA) from the static ones (cargo, parties, documents)
into a separate item brings it to **1 unit per message: −60 % write cost** at every fleet size.

---

## 4. How it behaves at scale

| Aspect | DynamoDB | RDS |
|---|---|---|
| **Writes** | spread over partitions by `shipmentId`; each partition takes 1,000 writes/s — one truck sends 1 every 30 s, so no hot partition. Scales without limit | one writer instance; scale up the instance size; beyond the largest one: manual sharding |
| **Many Lambdas at once** | no connections; limited only by the Lambda concurrency quota (10 on this account, 1,000 default) | every Lambda needs a connection; `max_connections` of a small instance is ~100 → **RDS Proxy required** |
| **Reads: one shipment** | `GetItem` / `Query`: constant ms at any size | indexed `SELECT`: constant ms |
| **Reads: dashboard list + KPIs** | `Scan` cost grows with **table size × open tabs**: today ~$0.11 / hour / tab (3 MB table). At 40,000 trucks with 90 days of history the table is ~9 GB: one scan ≈ $0.18 and far longer than a Lambda may run → **the scan stops working**; must become a sparse GSI on active shipments + KPIs maintained in the write path | `SELECT … GROUP BY` with indexes, read replicas for heavy dashboards → **RDS's strongest point** |
| **Availability** | 3 AZs, no failover to manage | Multi-AZ: standby at 2× price, failover ~1–2 min |
| **Operations** | none (no versions, no vacuum, no disk size) | engine upgrades, vacuum, storage and IOPS sizing, connection tuning |
| **Latency under load** | stays single-digit ms | stays low until CPU / IOPS / connections saturate, then degrades |

### The scaling path for this project

1. **Now (40 trucks):** DynamoDB on-demand, table scans for the dashboard — correct and cheap.
2. **First change (hundreds of viewers or thousands of trucks):** sparse GSI on active shipments, a few
   seconds of response caching, KPIs maintained in the write path instead of scanned.
3. **Steady high load:** switch the tables to provisioned capacity with auto-scaling (≈ 2.4× cheaper),
   shrink the hot item to 1 write unit.
4. **Heavy analytics:** stream changes (DynamoDB Streams → S3) and query with Athena, or feed a small
   relational read model — instead of moving the operational data to RDS.

---

## 5. For the Q&A

> "My app always accesses one shipment by its ID — that's key-value, which DynamoDB does in milliseconds.
> The load is small and bursty, so per-request pricing costs about 7 dollars a month at 40 trucks and
> nothing when idle; the smallest RDS setup with the VPC access and connection proxy it needs costs around 80, used or not.
> RDS would win on analytics, and on raw price only at tens of thousands of trucks with constant load —
> and even there my first step would be DynamoDB provisioned capacity, which cuts the cost by more than half."

**If asked "so at large scale you'd switch to RDS?":**
> "Not for the live tracking. The writes still partition perfectly by shipment, and DynamoDB keeps three
> AZs without me running failover. I'd add a relational or Athena read model for analytics next to it."
