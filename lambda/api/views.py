"""
Read-side model: turns stored shipment items into API views and computes KPIs.

dashboard/src/sim/views.js mirrors this module for the mock mode — keep in sync.

Every KPI is derived from what the pipeline actually recorded:
  - delay        = deliveredAt − plannedDeliveryAt  (predicted: etaAt − plannedDeliveryAt)
  - ETA accuracy = |deliveredAt − ETA predicted when the truck passed halfway|
  - CO2e, fuel, tolls, hold minutes = totals reported by the vehicle telematics
"""

from collections import defaultdict
from datetime import datetime, timezone, timedelta

INTERNAL = {"ttl", "manualDelay", "delayReason", "updatedBy", "manualUpdatedAt", "etaAtHalfway"}
SIGNAL_LOST_AFTER_S = 5 * 60
CAUSE_LABELS = {"customs": "Customs clearance", "spotCheck": "Border spot checks", "traffic": "Traffic congestion"}


def ts(value) -> float | None:
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()


def num(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def delay_minutes(item: dict) -> float | None:
    planned = ts(item.get("plannedDeliveryAt"))
    actual  = ts(item.get("deliveredAt") or item.get("etaAt"))
    return None if planned is None or actual is None else round((actual - planned) / 60)


def shipment_view(item: dict, real_now: float) -> dict:
    view = {k: v for k, v in item.items() if k not in INTERNAL}
    delivered = item.get("status") == "DELIVERED"
    delay = delay_minutes(item)
    view["delayMin"] = delay
    view["onTime"]   = (delay <= 0) if delivered and delay is not None else None
    view["flag"]     = ({"reason": item.get("delayReason") or "Flagged by operator",
                         "at": item.get("manualUpdatedAt")} if item.get("manualDelay") else None)

    exceptions = []
    if not delivered:
        if delay is not None and delay > 0:
            exceptions.append("LATE_RISK")
        cargo = item.get("cargo") or {}
        temp  = item.get("reeferTempC")
        if temp is not None and cargo.get("tempMinC") is not None and \
                not (num(cargo["tempMinC"]) <= num(temp) <= num(cargo["tempMaxC"])):
            exceptions.append("TEMP_EXCURSION")
        if item.get("status") == "BORDER_HOLD":
            exceptions.append("BORDER_HOLD")
        seen = ts(item.get("lastSeenAt"))
        if seen and real_now - seen > SIGNAL_LOST_AFTER_S:
            exceptions.append("SIGNAL_LOST")
    if item.get("manualDelay") and not delivered:
        exceptions.append("FLAGGED")
    view["exceptions"] = exceptions
    critical = bool({"TEMP_EXCURSION", "SIGNAL_LOST"} & set(exceptions)) or         ("LATE_RISK" in exceptions and (delay or 0) > 120)
    view["severity"] = "critical" if critical else "warning" if exceptions else "ok"
    return view


def clock(items: list[dict]) -> float:
    """Reference 'now' = latest simulated time seen (the simulator may run faster than real time)."""
    times = [ts(i.get("simTime")) for i in items if i.get("simTime")]
    return max(times) if times else datetime.now(timezone.utc).timestamp()


def compute_metrics(items: list[dict], days: int = 30, customer_id: str | None = None) -> dict:
    now   = clock(items)
    since = now - days * 86_400
    if customer_id:
        items = [i for i in items if i.get("customerId") == customer_id]

    active    = [i for i in items if i.get("status") != "DELIVERED"]
    delivered = [i for i in items if i.get("status") == "DELIVERED" and (ts(i.get("deliveredAt")) or 0) >= since]

    delays  = [delay_minutes(i) for i in delivered]
    on_time = [d for d in delays if d is not None and d <= 0]
    late    = [d for d in delays if d is not None and d > 0]
    eta_err = [abs(ts(i["deliveredAt"]) - ts(i["etaAtHalfway"])) / 60
               for i in delivered if i.get("etaAtHalfway")]

    def tot(i, key):
        return num((i.get("totals") or {}).get(key))

    tkm      = sum(num(i.get("distanceKm")) * num((i.get("cargo") or {}).get("tonnes")) for i in delivered)
    co2      = sum(tot(i, "co2eKg") for i in delivered)
    km       = sum(num(i.get("distanceKm")) for i in delivered)
    cost     = sum(tot(i, "fuelEur") + tot(i, "tollEur") for i in delivered)
    transit  = [(ts(i["deliveredAt"]) - ts(i["departedAt"])) / 3600 for i in delivered if i.get("departedAt")]
    reefer   = [i for i in delivered if (i.get("cargo") or {}).get("tempMinC") is not None]
    excursed = [i for i in reefer if tot(i, "tempExcursions") > 0]

    # Daily series (UTC days, oldest first)
    day0  = datetime.fromtimestamp(now, timezone.utc).date()
    daily = {(day0 - timedelta(days=d)).isoformat(): {"delivered": 0, "onTime": 0, "late": 0, "co2eKg": 0.0}
             for d in range(days - 1, -1, -1)}
    for i, d in zip(delivered, delays):
        key = datetime.fromtimestamp(ts(i["deliveredAt"]), timezone.utc).date().isoformat()
        if key in daily:
            row = daily[key]
            row["delivered"] += 1
            row["onTime" if d is not None and d <= 0 else "late"] += 1
            row["co2eKg"] += tot(i, "co2eKg")

    def group(key_fn, label_fn):
        groups = defaultdict(list)
        for i in delivered:
            groups[key_fn(i)].append(i)
        rows = []
        for key, grp in groups.items():
            ds = [delay_minutes(i) for i in grp]
            g_tkm = sum(num(i.get("distanceKm")) * num((i.get("cargo") or {}).get("tonnes")) for i in grp)
            g_co2 = sum(tot(i, "co2eKg") for i in grp)
            rows.append({
                "key": key, "label": label_fn(grp[0]), "shipments": len(grp),
                "onTimeRate": round(sum(1 for d in ds if d is not None and d <= 0) / len(grp), 3),
                "avgTransitHours": round(sum((ts(i["deliveredAt"]) - ts(i["departedAt"])) / 3600
                                             for i in grp if i.get("departedAt")) / len(grp), 1),
                "co2eKg": round(g_co2), "gCo2ePerTkm": round(g_co2 * 1000 / g_tkm) if g_tkm else None,
                "costEur": round(sum(tot(i, "fuelEur") + tot(i, "tollEur") for i in grp)),
            })
        return sorted(rows, key=lambda r: -r["shipments"])

    causes = {k: {"cause": label, "minutes": 0, "shipments": 0} for k, label in CAUSE_LABELS.items()}
    for i in delivered:
        for k, minutes in ((i.get("totals") or {}).get("holdMin") or {}).items():
            if k in causes and num(minutes) > 0:
                causes[k]["minutes"] += round(num(minutes))
                causes[k]["shipments"] += 1

    buckets = [("≤ 15 min", 15), ("≤ 30 min", 30), ("≤ 1 h", 60), ("≤ 2 h", 120), ("> 2 h", float("inf"))]
    eta_hist, prev = [], -1.0
    for label, hi in buckets:
        eta_hist.append({"bucket": label, "shipments": sum(1 for e in eta_err if prev < e <= hi)})
        prev = hi

    status_counts = defaultdict(int)
    for i in active:
        status_counts[i.get("status")] += 1

    def pct(a, b):
        return round(a / b, 3) if b else None

    return {
        "generatedAt": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"days": days, "from": datetime.fromtimestamp(since, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
        "customerId": customer_id,
        "kpis": {
            "active": len(active),
            "atRisk": sum(1 for i in active if (delay_minutes(i) or 0) > 0),
            "delivered": len(delivered),
            "onTimeRate": pct(len(on_time), len(on_time) + len(late)),
            "avgLateMin": round(sum(late) / len(late)) if late else 0,
            "etaMaeMin": round(sum(eta_err) / len(eta_err)) if eta_err else None,
            "etaWithin30Rate": pct(sum(1 for e in eta_err if e <= 30), len(eta_err)),
            "co2eKg": round(co2),
            "gCo2ePerTkm": round(co2 * 1000 / tkm) if tkm else None,
            "distanceKm": round(km),
            "tonneKm": round(tkm),
            "avgTransitHours": round(sum(transit) / len(transit), 1) if transit else None,
            "costEur": round(cost),
            "costPerKmEur": round(cost / km, 2) if km else None,
            "reeferShipments": len(reefer),
            "tempExcursionRate": pct(len(excursed), len(reefer)),
            "cargoValueEur": round(sum(num((i.get("cargo") or {}).get("valueEur")) for i in delivered)),
        },
        "statusCounts": dict(status_counts),
        "daily": [{"date": d, **{k: (round(v) if k == "co2eKg" else v) for k, v in row.items()}}
                  for d, row in daily.items()],
        "lanes": group(lambda i: i.get("laneId"), lambda i: i.get("routeLabel"))[:12],
        "customers": [] if customer_id else group(lambda i: i.get("customerId"), lambda i: i.get("customerName")),
        "fuelMix": group(lambda i: i.get("fuelType"), lambda i: i.get("fuelType")),
        "delayCauses": sorted(causes.values(), key=lambda c: -c["minutes"]),
        "etaAccuracy": eta_hist,
    }
