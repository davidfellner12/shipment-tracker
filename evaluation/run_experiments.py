"""
Reproducible experiments for the report (report/report.pdf).

  python evaluation/run_experiments.py          # all experiments, ≈ 3–5 min
  python evaluation/run_experiments.py --quick  # fewer seeds/days, for a smoke test

Writes evaluation/results/results.json and the figures in report/figures/.

E1  Operational outcomes of the simulated fleet over several random seeds
    (on-time rate, ETA accuracy, emission intensity, transit time).
E2  ETA prediction: the rule-aware predictor used by the system vs. a naive
    distance/speed baseline, with an ablation of each model component,
    evaluated at fixed progress checkpoints of every delivered shipment.
E3  Sensitivity of the on-time rate to the planning policy
    (traffic allowance × booking slack).
E4  Ingestion robustness: the real process_event Lambda (against mocked
    DynamoDB/SQS) fed with duplicated, reordered and malformed telemetry must
    converge to exactly the same state as a clean, in-order stream.
E5  Throughput headroom: measured message sizes vs. Kinesis shard limits
    for different fleet sizes and reporting intervals.
"""

import argparse
import base64
import importlib.util
import json
import os
import random
import statistics as st
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "simulator"))
from engine import Fleet  # noqa: E402

RESULTS = ROOT / "evaluation" / "results"
FIGURES = ROOT / "report" / "figures"
START = 1_780_000_000                    # fixed simulated start (2026-05-28) for reproducibility
CHECKPOINTS = [0.1, 0.25, 0.5, 0.75, 0.9]
NAIVE_KMH = 80                           # the original proposal's "distance / speed" ETA


def ts(value: str) -> float:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").timestamp()


def pct(values, q):
    s = sorted(values)
    return s[min(len(s) - 1, int(q * len(s)))] if s else None


# ── E1 + E2: simulate, record outcomes and ETA predictions ───────────────────────
def predictors(fleet: Fleet, v: dict) -> dict:
    """ETA (epoch s) of each predictor for vehicle v at the current simulated time."""
    s = v["shipment"]
    lane = fleet.lanes[s["laneId"]]
    now, remaining = fleet.now, lane.km - s["km"]
    unload = 45 * 60
    drive = fleet._drive_minutes(lane, s["km"]) * 60
    customs = sum(1 for a, b in lane.crossings_after(s["km"]) if fleet._is_customs(a, b)) * 3600
    return {
        "naive": now + remaining / NAIVE_KMH * 3600 + unload,
        "speed_profile": now + drive + unload,
        "speed_customs": now + drive + customs + unload,
        "full": fleet.eta(v),
    }


def simulate(seed: int, days: int, probe_eta: bool):
    fleet = Fleet(seed=seed, start=START)
    probes: dict[str, dict] = {}          # shipmentId → {checkpoint: predictions}
    delivered: dict[str, dict] = {}
    for _ in range(days * 1440):
        fleet.advance(1)
        if probe_eta:
            for v in fleet.vehicles:
                s = v["shipment"]
                if not s or not s.get("departedAt"):
                    continue
                prog = s["km"] / fleet.lanes[s["laneId"]].km
                seen = probes.setdefault(s["shipmentId"], {})
                for cp in CHECKPOINTS:
                    if prog >= cp and cp not in seen and v["mode"] != "UNLOADING":
                        seen[cp] = predictors(fleet, v)
        for v in fleet.vehicles:
            for s in v["outbox"]:
                delivered[s["shipmentId"]] = {**s, "fuel": v["fuel"]}
            v["outbox"] = []
    return delivered, probes


def outcome_metrics(delivered: dict) -> dict:
    ds = list(delivered.values())
    delays = [(s["deliveredAt"] - s["plannedDeliveryAt"]) / 60 for s in ds]
    late = [d for d in delays if d > 0]
    tkm = sum(fleet_lane_km(s) * s["cargo"]["tonnes"] for s in ds)
    co2 = sum(s["totals"]["co2eKg"] for s in ds)
    reefer = [s for s in ds if s["cargo"]["tempMinC"] is not None]
    return {
        "shipments": len(ds),
        "onTimeRate": sum(d <= 0 for d in delays) / len(ds),
        "avgLateMin": st.mean(late) if late else 0.0,
        "p90DelayMin": pct(delays, 0.9),
        "gCo2ePerTkm": co2 * 1000 / tkm,
        "medianTransitH": st.median((s["deliveredAt"] - s["departedAt"]) / 3600 for s in ds),
        "customsHoldShare": sum(s["totals"]["holdMin"]["customs"] > 0 for s in ds) / len(ds),
        "tempExcursionRate": (sum(s["totals"]["tempExcursions"] > 0 for s in reefer) / len(reefer)) if reefer else 0.0,
        "delays": delays,
    }


_LANE_KM = {}


def fleet_lane_km(s):
    if not _LANE_KM:
        for lane in json.loads((ROOT / "shared" / "network.json").read_text(encoding="utf-8"))["lanes"]:
            _LANE_KM[lane["id"]] = lane["distanceKm"]
    return _LANE_KM[s["laneId"]]


def eta_errors(delivered: dict, probes: dict) -> dict:
    """Absolute ETA error (min) per predictor and checkpoint, over delivered shipments."""
    out = {}
    for cp in CHECKPOINTS:
        out[cp] = {}
        for name in ("naive", "speed_profile", "speed_customs", "full"):
            errs = [abs(p[cp][name] - delivered[sid]["deliveredAt"]) / 60
                    for sid, p in probes.items() if sid in delivered and cp in p]
            out[cp][name] = {
                "n": len(errs), "mae": st.mean(errs), "p90": pct(errs, 0.9),
                "within30": sum(e <= 30 for e in errs) / len(errs),
                "over2h": sum(e > 120 for e in errs) / len(errs),
                "medianAE": st.median(errs),
            }
    return out


# ── E3: planning-policy sensitivity ──────────────────────────────────────────────
def sensitivity(days: int, seed: int = 101):
    grid = []
    for slack in (0.25, 0.5, 1.0):
        for factor in (0.9, 0.95, 1.0, 1.05, 1.1):
            fleet = Fleet(seed=seed, start=START)
            fleet.params["planningTrafficFactor"] = factor
            fleet.params["bookingSlackFactor"] = slack
            done = []
            for _ in range(days * 96):
                fleet.advance(15)
                for v in fleet.vehicles:
                    done += v["outbox"]
                    v["outbox"] = []
            on_time = sum(s["deliveredAt"] <= s["plannedDeliveryAt"] for s in done) / len(done)
            early = st.median((s["plannedDeliveryAt"] - s["deliveredAt"]) / 60 for s in done)
            grid.append({"slack": slack, "factor": factor, "onTimeRate": on_time, "medianEarlyMin": early, "n": len(done)})
            print(f"    slack={slack:<4} factor={factor:<4} on-time={on_time:.3f}  median early={early:.0f} min")
    return grid


# ── E4: ingestion robustness ─────────────────────────────────────────────────────
def load_handler(name):
    spec = importlib.util.spec_from_file_location(f"{name}_h", ROOT / "lambda" / name / "handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def robustness(days: int, seed: int = 202):
    os.environ.update({"AWS_DEFAULT_REGION": "eu-central-1", "AWS_ACCESS_KEY_ID": "x", "AWS_SECRET_ACCESS_KEY": "x",
                       "SHIPMENTS_TABLE": "S", "EVENTS_TABLE": "E"})
    import boto3
    from moto import mock_aws

    fleet = Fleet(seed=seed, start=START)
    stream = []
    for _ in range(days * 96):
        fleet.advance(15)
        stream += fleet.messages(sent_at=START, significant_only=True)

    rng = random.Random(seed)
    dup = [m for m in stream if rng.random() < 0.2]
    malformed = []
    for m in rng.sample(stream, max(1, len(stream) // 50)):
        bad = dict(m)
        rng.choice([lambda b: b.update(latitude=123.0), lambda b: b.pop("seq"),
                    lambda b: b.update(status="TELEPORTING")])(bad)
        malformed.append(bad)
    perturbed = stream + dup + malformed
    # local reordering: shuffle within sliding windows of 25 messages (≈ a few Kinesis batches)
    for i in range(0, len(perturbed), 25):
        window = perturbed[i:i + 25]
        rng.shuffle(window)
        perturbed[i:i + 25] = window

    def ingest(msgs):
        with mock_aws():
            ddb = boto3.resource("dynamodb")
            ddb.create_table(TableName="S", BillingMode="PAY_PER_REQUEST",
                             KeySchema=[{"AttributeName": "shipmentId", "KeyType": "HASH"}],
                             AttributeDefinitions=[{"AttributeName": "shipmentId", "AttributeType": "S"}])
            ddb.create_table(TableName="E", BillingMode="PAY_PER_REQUEST",
                             KeySchema=[{"AttributeName": "shipmentId", "KeyType": "HASH"},
                                        {"AttributeName": "sk", "KeyType": "RANGE"}],
                             AttributeDefinitions=[{"AttributeName": "shipmentId", "AttributeType": "S"},
                                                   {"AttributeName": "sk", "AttributeType": "S"}])
            os.environ["DLQ_URL"] = boto3.client("sqs").create_queue(QueueName="dlq")["QueueUrl"]
            handler = load_handler("process_event")
            t0 = time.perf_counter()
            for i in range(0, len(msgs), 100):
                records = [{"kinesis": {"data": base64.b64encode(json.dumps(m).encode()).decode(),
                                        "sequenceNumber": str(i + j)}} for j, m in enumerate(msgs[i:i + 100])]
                assert handler.handler({"Records": records}, None) == {"batchItemFailures": []}
            elapsed = time.perf_counter() - t0
            state = {i["shipmentId"]: i for i in ddb.Table("S").scan()["Items"]}
            events = ddb.Table("E").scan()["Items"]
            dlq = int(boto3.client("sqs").get_queue_attributes(
                QueueUrl=os.environ["DLQ_URL"], AttributeNames=["ApproximateNumberOfMessages"]
            )["Attributes"]["ApproximateNumberOfMessages"])
            return state, len(events), dlq, elapsed

    clean_state, clean_events, _, clean_s = ingest(stream)
    pert_state, pert_events, dlq, _ = ingest(perturbed)
    volatile = {"lastSeenAt", "ingestLatencyMs", "ttl"}
    same = sum(1 for sid, item in clean_state.items()
               if {k: v for k, v in item.items() if k not in volatile}
               == {k: v for k, v in pert_state.get(sid, {}).items() if k not in volatile})
    return {
        "messages": len(stream), "duplicates": len(dup), "malformed": len(malformed),
        "shipments": len(clean_state), "identicalFinalState": same,
        "eventsClean": clean_events, "eventsPerturbed": pert_events, "dlqMessages": dlq,
        "localThroughputMsgPerS": len(stream) / clean_s,
    }


# ── E5: throughput headroom ──────────────────────────────────────────────────────
def throughput(seed: int = 303):
    fleet = Fleet(seed=seed, start=START)
    fleet.advance(3 * 1440)
    sizes = []
    for _ in range(30):
        fleet.advance(1)
        sizes += [len(json.dumps(m, separators=(",", ":")).encode()) for m in fleet.messages(sent_at=START)]
    avg = st.mean(sizes)
    shard_records, shard_bytes = 1000, 1_000_000          # Kinesis per-shard write limits (records/s, bytes/s)
    rows = []
    for interval in (3, 30, 60):
        max_trucks = min(shard_records * interval, int(shard_bytes / avg * interval))
        rows.append({"intervalS": interval, "trucksPerShard": max_trucks,
                     "msgPerDayPer1000Trucks": 1000 * 86400 / interval})
    return {"avgMessageBytes": avg, "p95MessageBytes": pct(sizes, 0.95), "rows": rows}


# ── figures ──────────────────────────────────────────────────────────────────────
def figures(results: dict):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    FIGURES.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({
        "font.family": "sans-serif", "font.sans-serif": ["Inter", "Segoe UI", "DejaVu Sans"], "font.size": 9,
        "axes.spines.top": False, "axes.spines.right": False, "axes.edgecolor": "#94a3b8",
        "axes.grid": True, "grid.color": "#e2e8f0", "grid.linewidth": 0.8, "axes.axisbelow": True,
        "xtick.color": "#475569", "ytick.color": "#475569", "axes.labelcolor": "#334155",
        "legend.frameon": False, "svg.fonttype": "none",
    })
    series = ["#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7"]   # validated categorical slots

    # F2 — ETA error vs progress per predictor
    labels = {"naive": "Distance / 80 km/h (baseline)", "speed_profile": "+ country speed profile",
              "speed_customs": "+ customs clearance", "full": "+ driving-time rules (system)"}
    eta = results["E2"]["errors"]
    fig, ax = plt.subplots(figsize=(6.2, 2.8))
    for (name, label), color in zip(labels.items(), series):
        y = [eta[str(cp)][name]["mae"] for cp in CHECKPOINTS]
        ax.plot([cp * 100 for cp in CHECKPOINTS], y, color=color, lw=2, marker="o", ms=4, label=label)
    ax.set_xlabel("Route progress when the ETA is made (%)")
    ax.set_ylabel("Mean absolute error (min)")
    ax.set_ylim(bottom=0)
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / "eta_error.svg")
    plt.close(fig)

    # F3 — planning policy sensitivity
    fig, ax = plt.subplots(figsize=(6.2, 2.5))
    grid = results["E3"]
    for slack, color in zip((0.25, 0.5, 1.0), series):
        rows = [g for g in grid if g["slack"] == slack]
        ax.plot([g["factor"] for g in rows], [g["onTimeRate"] * 100 for g in rows], color=color, lw=2, marker="o", ms=4,
                label=f"booking slack × {slack}")
    ax.set_xlabel("Planning traffic factor (planned drive time ÷ expected)")
    ax.set_ylabel("On-time deliveries (%)")
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / "sensitivity.svg")
    plt.close(fig)

    # F4 — delay distribution
    delays = results["E1"]["delays"]
    fig, ax = plt.subplots(figsize=(6.2, 2.3))
    clipped = [max(-360, min(360, d)) for d in delays]
    ax.hist([d for d in clipped if d <= 0], bins=range(-360, 1, 20), color=series[0], label="On time", rwidth=0.9)
    ax.hist([d for d in clipped if d > 0], bins=range(0, 361, 20), color=series[1], label="Late", rwidth=0.9)
    ax.set_xlabel("Actual − planned delivery time (min, clipped at ±6 h)")
    ax.set_ylabel("Shipments")
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / "delay_distribution.svg")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true")
    args = parser.parse_args()
    seeds = [1, 2, 3] if args.quick else [1, 2, 3, 4, 5]
    days = 7 if args.quick else 30
    RESULTS.mkdir(parents=True, exist_ok=True)
    results = {"config": {"seeds": seeds, "days": days, "trucks": len(Fleet(seed=0).vehicles),
                          "checkpoints": CHECKPOINTS, "naiveKmh": NAIVE_KMH}}

    print(f"E1/E2: simulating {len(seeds)} seeds × {days} days …")
    per_seed, all_delays, merged_delivered, merged_probes = [], [], {}, {}
    for seed in seeds:
        t0 = time.time()
        delivered, probes = simulate(seed, days, probe_eta=True)
        m = outcome_metrics(delivered)
        all_delays += m.pop("delays")
        per_seed.append(m)
        merged_delivered.update({f"{seed}:{k}": v for k, v in delivered.items()})
        merged_probes.update({f"{seed}:{k}": v for k, v in probes.items()})
        print(f"  seed {seed}: {m['shipments']} deliveries, on-time {m['onTimeRate']:.3f} ({time.time() - t0:.0f}s)")
    summary = {k: {"mean": st.mean(r[k] for r in per_seed), "sd": st.stdev(r[k] for r in per_seed)}
               for k in per_seed[0]}
    results["E1"] = {"perSeed": per_seed, "summary": summary, "delays": all_delays}
    results["E2"] = {"errors": {str(k): v for k, v in eta_errors(merged_delivered, merged_probes).items()}}

    print("E3: planning-policy sensitivity …")
    results["E3"] = sensitivity(days=7 if args.quick else 14)

    print("E4: ingestion robustness …")
    results["E4"] = robustness(days=2 if args.quick else 4)
    print(f"  {results['E4']}")

    print("E5: throughput headroom …")
    results["E5"] = throughput()

    (RESULTS / "results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    figures(results)
    print(f"Wrote {RESULTS / 'results.json'} and figures to {FIGURES}")


if __name__ == "__main__":
    main()
