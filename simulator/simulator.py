"""
Fleet telematics simulator — publishes truck telemetry to AWS IoT Core.

40 trucks run real European road lanes (see engine.py for the operational model).
By default the simulation runs in real time and each truck reports every 30 s, like a
real telematics unit. For a lively demo, fast-forward: --speed 30 --interval 3.
State is saved to simulator/.state.json, so a restart resumes the same trucks and shipments.

On first start the fleet's recent history (--backfill-days) is simulated and
published in fast-forward, so the dashboard's metrics have real data at once.

  python simulator.py                  # real time, report every 30 s
  python simulator.py --speed 30 --interval 3   # fast-forward demo
  python simulator.py --dry-run        # no AWS: print telemetry to the console
  python simulator.py --reset          # forget saved state, new fleet + history

MQTT QoS AT_LEAST_ONCE may deliver duplicates; each message carries a
per-shipment sequence number and the backend ignores anything not newer.
"""

import sys
import json
import time
import uuid
import argparse
from datetime import datetime, timezone
from pathlib import Path

from engine import Fleet

HERE       = Path(__file__).resolve().parent
STATE_FILE = HERE / ".state.json"
TOPIC      = "shipments/{shipment_id}/location"

STATUS_ICON = {"LOADING": "📦", "IN_TRANSIT": "🚚", "BREAK": "☕", "REST": "🛏", "BORDER_HOLD": "🛃",
               "UNLOADING": "📦", "DELIVERED": "✅"}


class Publisher:
    """Thin wrapper over the AWS IoT MQTT connection (or stdout in dry-run)."""

    def __init__(self, dry_run: bool):
        self.dry_run = dry_run
        self.connection = None

    def connect(self):
        if self.dry_run:
            return
        from config import IOT_ENDPOINT, IOT_PORT, CERT_PATH, KEY_PATH, CA_PATH, CLIENT_ID_PREFIX
        from awsiot import mqtt_connection_builder

        if not IOT_ENDPOINT:
            sys.exit("IOT_ENDPOINT is not set. Run `python scripts/provision_device.py` after deploying "
                     "(or use --dry-run).")
        for path in (CERT_PATH, KEY_PATH, CA_PATH):
            if not Path(path).exists():
                sys.exit(f"Missing {path}. Run `python scripts/provision_device.py` first.")

        print(f"Connecting to AWS IoT Core: {IOT_ENDPOINT}")
        self.connection = mqtt_connection_builder.mtls_from_path(
            endpoint=IOT_ENDPOINT, port=IOT_PORT,
            cert_filepath=CERT_PATH, pri_key_filepath=KEY_PATH, ca_filepath=CA_PATH,
            # Unique id: two simulators with the same id would kick each other off.
            client_id=f"{CLIENT_ID_PREFIX}-{uuid.uuid4().hex[:8]}",
            clean_session=True, keep_alive_secs=30,
            on_connection_interrupted=lambda conn, error, **kw: print(f"⚠ Connection interrupted: {error}"),
            on_connection_resumed=lambda conn, rc, session_present, **kw: print("✓ Connection resumed"),
        )
        self.connection.connect().result(timeout=15)
        print("Connected.")

    def publish(self, msg: dict):
        if self.dry_run:
            return
        from awscrt import mqtt
        self.connection.publish(
            topic=TOPIC.format(shipment_id=msg["shipmentId"]),
            payload=json.dumps(msg, separators=(",", ":")),
            qos=mqtt.QoS.AT_LEAST_ONCE,
        )

    def disconnect(self):
        if self.connection:
            self.connection.disconnect().result()


def save(fleet: Fleet):
    STATE_FILE.write_text(json.dumps(fleet.state()), encoding="utf-8")


def backfill(fleet: Fleet, pub: Publisher, days: float, rate: int):
    """Simulate the last `days` (fleet must start `days` ago) in fast-forward, publishing milestones only."""
    sent, total_min = 0, int(days * 1440)
    print(f"Backfilling {days:g} days of fleet history…")
    for done in range(0, total_min, 15):
        fleet.advance(15)
        for msg in fleet.messages(significant_only=True):
            pub.publish(msg)
            sent += 1
            if not pub.dry_run and sent % rate == 0:
                time.sleep(1)          # stay well below IoT Core per-connection limits
        if done % (1440 * 2) == 0:
            print(f"  day {done // 1440 + 1:>3}/{days:g} — {sent} messages")
    print(f"Backfill done: {sent} messages.\n")


def print_cycle(fleet: Fleet, msgs: list[dict]):
    sim = datetime.fromtimestamp(fleet.now, timezone.utc).strftime("%a %d %b %H:%M UTC")
    print(f"── sim time {sim} ── {len(msgs)} active " + "─" * 40)
    for m in msgs:
        late = (datetime.fromisoformat(m["etaAt"].replace("Z", "+00:00")) -
                datetime.fromisoformat(m["plannedDeliveryAt"].replace("Z", "+00:00"))).total_seconds() / 60
        flag = f"⚠ +{late:.0f}m" if late > 0 else "on time"
        events = ", ".join(e["type"] for e in m["events"])
        print(f"{STATUS_ICON.get(m['status'], '•')} {m['shipmentId']} {m['routeLabel'][:24]:<24} "
              f"{m['status']:<11} {m['progress'] * 100:5.1f}%  {m['speedKmh']:5.1f} km/h  {m['country']}  "
              f"{flag:<9} {events}")


def main():
    parser = argparse.ArgumentParser(description="Fleet telematics simulator")
    parser.add_argument("--speed", type=float, default=1, help="Simulated seconds per real second (default 1 = real time)")
    parser.add_argument("--interval", type=float, default=30.0, help="Real seconds between publish cycles (default 30)")
    parser.add_argument("--backfill-days", type=float, default=30, help="History to generate on first start")
    parser.add_argument("--rate", type=int, default=80, help="Max messages/s during backfill")
    parser.add_argument("--reset", action="store_true", help="Discard saved state and start a new fleet")
    parser.add_argument("--dry-run", action="store_true", help="Print telemetry instead of publishing")
    parser.add_argument("--cycles", type=int, default=None, help="Stop after N cycles (smoke test)")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    pub = Publisher(args.dry_run)
    pub.connect()

    if STATE_FILE.exists() and not args.reset and not args.dry_run:
        fleet = Fleet.from_state(json.loads(STATE_FILE.read_text(encoding="utf-8")), seed=args.seed)
        print(f"Resumed fleet from {STATE_FILE.name}")
    else:
        start = datetime.now(timezone.utc).timestamp() - max(args.backfill_days, 0) * 86_400
        fleet = Fleet(seed=args.seed, start=start)
        if args.backfill_days > 0:
            backfill(fleet, pub, args.backfill_days, args.rate)

    step_min = args.interval * args.speed / 60
    print(f"Live: {len(fleet.vehicles)} trucks, {args.speed:g}× speed "
          f"({step_min:.1f} sim-min every {args.interval:g}s). Ctrl+C to stop.\n")
    cycle = 0
    try:
        while args.cycles is None or cycle < args.cycles:
            cycle += 1
            started = time.time()
            fleet.advance(step_min)
            msgs = fleet.messages()
            for msg in msgs:
                pub.publish(msg)
            print_cycle(fleet, msgs)
            if not args.dry_run:
                save(fleet)
            time.sleep(max(0.0, args.interval - (time.time() - started)))
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
    finally:
        if not args.dry_run:
            save(fleet)
        pub.disconnect()


if __name__ == "__main__":
    main()
