# Dashboard Metrics — How Every Number Is Calculated

Every KPI in the dashboard is computed on request from what the pipeline stored in DynamoDB.
Nothing is pre-computed or hard-coded.

```
 truck message ──► process_event Lambda ──► DynamoDB ShipmentsTable ──► api Lambda ──► GET /metrics ──► dashboard
 (position, status,     (validates, stores state,        (one item per          (scan + aggregate     (polled every 15 s)
  ETA, running totals)   ETA snapshot at half-way)        shipment)              in Python)
```

| Step | Code |
|---|---|
| Truck computes ETA, fuel, CO₂e, tolls | `simulator/engine.py` (`eta()` line 250, energy in `_drive()`) |
| ETA at half-way is stored | `lambda/process_event/handler.py` → `record_halfway_eta()` |
| KPIs are aggregated | `lambda/api/views.py` → `compute_metrics()` |
| Exceptions and severity per shipment | `lambda/api/views.py` → `shipment_view()` |
| Same logic for the offline demo mode | `dashboard/src/sim/views.js` (parity-tested) |
| Emission factors, fuel prices, tolls | `shared/params.json` |

## Which shipments are counted

- **Window:** shipments with status `DELIVERED` and `deliveredAt` within the last *N* days (7, 14 or 30).
- **"Now"** is the newest `simTime` in the table, not the wall clock. The simulator can run faster than real time, so
  "30 days" means 30 *simulated* days.
- **Customer view:** the same calculation, filtered to one `customerId`.

## Inputs: where each one comes from

| Field | Set by | Meaning |
|---|---|---|
| `plannedDeliveryAt` | booking (simulator) | planned transit time + a customer-specific buffer |
| `departedAt`, `deliveredAt` | truck message | actual departure and proof of delivery |
| `etaAt` | truck message | current ETA (see below) |
| `etaAtHalfway` | `process_event` Lambda | the ETA the truck predicted when it passed 50–65 % of the route |
| `distanceKm`, `cargo.tonnes`, `cargo.valueEur` | booking | lane length, payload, declared goods value |
| `totals.co2eKg`, `fuelEur`, `tollEur`, `holdMin`, `tempExcursions` | truck message | running totals from the telematics unit |

### The ETA (computed on the truck)

```
ETA = now
    + remaining driving time        (speed profile per country, on the real road geometry)
    + mandatory breaks and rests    (EU 561/2006: 45 min after 4.5 h, 11 h rest after 9 h, given the driver's hours so far)
    + 60 min per remaining customs border
    + 45 min unloading
```

It does **not** know about future traffic jams or spot checks. That gap is exactly what the ETA-accuracy KPI measures.

### The ETA snapshot at half-way (computed in AWS)

When a message arrives with progress between 50 % and 65 %, `process_event` stores its `etaAt` as `etaAtHalfway`,
using a conditional write: **the message with the lowest `seq` wins**. Duplicates or messages arriving out of order
cannot change the result (tested in the fault-injection experiment).

### Fuel, CO₂e and tolls (accumulated every simulated minute)

```
fuel units  = (base per 100 km + extra per tonne × payload) / 100 × km driven
CO₂e (kg)   = fuel units × well-to-wheel factor
fuel €      = fuel units × price per unit
toll €      = km driven × toll rate of the current country
```

| Powertrain | Base / 100 km | + per tonne | kg CO₂e per unit (well-to-wheel) | € per unit |
|---|---|---|---|---|
| Diesel | 22.0 L | 0.40 L | 3.17 / L | 1.62 |
| LNG | 19.5 kg | 0.36 kg | 3.10 / kg | 1.35 |
| HVO (renewable diesel) | 23.0 L | 0.42 L | 0.51 / L | 2.05 |
| Electric | 95 kWh | 1.50 kWh | 0.25 / kWh | 0.32 |

Factors approximate the GLEC Framework. Tolls per km: AT 0.46, DE 0.35, CH 0.85, FR 0.20, PL 0.13 … (full list in
`shared/params.json`).

## The KPIs

`delay = deliveredAt − plannedDeliveryAt` in minutes (for a shipment on the road: `etaAt − plannedDeliveryAt`).

| KPI (page) | Formula |
|---|---|
| **Active shipments** (Overview) | number of shipments with status ≠ `DELIVERED` |
| **Predicted late** (Overview) | active shipments whose current ETA is after the planned delivery (`delay > 0`) |
| **On-time delivery** | delivered with `delay ≤ 0` ÷ delivered (with a planned time) |
| **Late by … on avg.** / **Avg. lateness** | mean `delay` of the **late** deliveries only |
| **ETA accuracy** | mean of `|deliveredAt − etaAtHalfway|` (mean absolute error, minutes) |
| **ETAs within 30 min** | share of deliveries with that error ≤ 30 min |
| **CO₂e intensity** | `Σ co2eKg × 1000 ÷ Σ (distanceKm × tonnes)` → g per tonne-km |
| **Emissions** (Analytics) | `Σ co2eKg` |
| **Avg. transit** | mean of `deliveredAt − departedAt` in hours |
| **Energy + tolls** | `Σ (fuelEur + tollEur)`; per km: `÷ Σ distanceKm` |
| **Cargo value moved** | `Σ cargo.valueEur` of the deliveries |
| **Cold-chain compliance** (customer view) | `1 −` reefer loads with at least one temperature excursion ÷ reefer loads |

### Charts and tables

| Chart | Calculation |
|---|---|
| **Deliveries per day** | deliveries grouped by UTC day of `deliveredAt`, split by `delay ≤ 0` (on time) and `> 0` (late) |
| **CO₂e per day** | `Σ co2eKg` per UTC delivery day |
| **ETA accuracy histogram** | the half-way ETA errors in buckets ≤ 15 min, ≤ 30 min, ≤ 1 h, ≤ 2 h, > 2 h |
| **Where time is lost** | `Σ totals.holdMin` per cause (customs, border spot checks, traffic). Mandatory breaks and rests are planned, so they are excluded |
| **Lanes / Customers / Powertrain** | the same formulas grouped by `laneId`, `customerId` or `fuelType`; lanes show the top 12 by volume |
| **Right now** (Overview) | active shipments counted by status, in the browser |

### Exceptions ("Needs attention")

For each shipment on the road:

| Code | Condition |
|---|---|
| `LATE_RISK` | current ETA after the planned delivery |
| `TEMP_EXCURSION` | reefer temperature outside the cargo's min/max |
| `BORDER_HOLD` | status is `BORDER_HOLD` |
| `SIGNAL_LOST` | no message for more than 5 minutes |
| `FLAGGED` | an operator flagged it (`PUT /shipments/{id}`) |

**Severity:** *critical* if there is a temperature excursion, a lost signal, or the shipment is more than 2 h late;
*warning* for any other exception; otherwise *ok*. The list is sorted by severity.

## Example: live values (20 Oct 2026, 30-day window)

| KPI | Value |
|---|---|
| Active shipments | 36 (2 predicted late) |
| Delivered | 2,209 |
| On-time delivery | 90.6 % (late ones: 100 min on average) |
| ETA accuracy | ±19 min, 91.5 % within 30 min |
| CO₂e | 497 t over 9.2 M tonne-km → 54 g/tkm |
| Distance | 717,498 km, avg. transit 10.5 h |
| Energy + tolls | €539,094 → €0.75/km |
| Cargo value moved | €401 M |
| Reefer loads | 290, 3.4 % with a temperature excursion |

## Limits to be honest about

- **The data is synthetic.** A simulator on real OpenStreetMap road geometry produces it and it goes through the real
  AWS pipeline; the calculations are real, the inputs are not.
- **ETA accuracy is an upper bound.** The predictor and the simulator share the same driving-time rules; real trucks
  would be less predictable. The meaningful result is the comparison with distance ÷ speed on the same data (8×
  better, `evaluation/run_experiments.py`).
- **Emission factors and toll rates are reference values**, not measured consumption.
- **It does not scale as is.** Each call scans the whole table (≈ 2,200 items, ≈ 3 MB). At larger sizes the
  aggregates should be maintained in the write path or cached (see the scaling slide).
