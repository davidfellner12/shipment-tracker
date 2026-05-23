"""
Real-Time Shipment Tracker — GPS Simulator
TU Wien × AWS 2026 — David Fellner

Simulates GPS-equipped trucks sending location events to AWS IoT Core.
Each truck follows a route between European logistics hubs.
"""

import json
import time
import math
import random
import argparse
from datetime import datetime, timezone
from config import IOT_ENDPOINT, IOT_PORT, CERT_PATH, KEY_PATH, CA_PATH, CLIENT_ID_PREFIX

# AWS IoT SDK v2
from awsiot import mqtt_connection_builder
from awscrt import mqtt

# ---------------------------------------------------------------------------
# Route definitions: (lat, lon, city_name) waypoints
# ---------------------------------------------------------------------------
ROUTES = {
    "SHIP-001": {
        "label": "Vienna → Hamburg",
        "cargo": "Electronics",
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (48.5, 14.5, "Linz area"),
            (48.8, 13.0, "Passau area"),
            (48.9, 11.5, "Regensburg area"),
            (49.5, 10.0, "Nuremberg area"),
            (50.1, 8.7, "Frankfurt area"),
            (51.5, 7.5, "Dortmund area"),
            (53.5503, 9.9937, "Hamburg"),
        ],
    },
    "SHIP-002": {
        "label": "Vienna → Munich",
        "cargo": "Auto Parts",
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (47.8, 15.5, "Wiener Neustadt area"),
            (47.5, 14.0, "Salzburg area"),
            (48.1351, 11.5820, "Munich"),
        ],
    },
    "SHIP-003": {
        "label": "Vienna → Warsaw",
        "cargo": "Medical Supplies",
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (49.0, 17.5, "Brno area"),
            (50.0, 19.5, "Kraków area"),
            (52.2297, 21.0122, "Warsaw"),
        ],
    },
    "SHIP-004": {
        "label": "Vienna → Zürich",
        "cargo": "Pharmaceuticals",
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (47.8, 15.0, "Salzburg area"),
            (47.5, 13.5, "Innsbruck area"),
            (47.3769, 8.5417, "Zürich"),
        ],
    },
}


def interpolate_position(waypoints: list, progress: float) -> tuple[float, float, str]:
    """Return (lat, lon, nearest_city) for a progress value in [0, 1]."""
    if progress >= 1.0:
        wp = waypoints[-1]
        return wp[0], wp[1], wp[2]
    if progress <= 0.0:
        wp = waypoints[0]
        return wp[0], wp[1], wp[2]

    segment_size = 1.0 / (len(waypoints) - 1)
    segment_idx = int(progress / segment_size)
    segment_idx = min(segment_idx, len(waypoints) - 2)
    local_progress = (progress - segment_idx * segment_size) / segment_size

    a = waypoints[segment_idx]
    b = waypoints[segment_idx + 1]
    lat = a[0] + (b[0] - a[0]) * local_progress
    lon = a[1] + (b[1] - a[1]) * local_progress
    city = a[2] if local_progress < 0.5 else b[2]
    return lat, lon, city


def add_gps_noise(lat: float, lon: float, noise_m: float = 50) -> tuple[float, float]:
    """Add realistic GPS noise (default ±50 m)."""
    noise_deg = noise_m / 111_000
    return (
        lat + random.gauss(0, noise_deg),
        lon + random.gauss(0, noise_deg),
    )


def compute_eta_minutes(progress: float, speed_kmh: float, total_km: float) -> int:
    remaining_km = total_km * (1.0 - progress)
    return int((remaining_km / speed_kmh) * 60)


class ShipmentSimulator:
    def __init__(self, delayed_ids: list[str] = None):
        self.delayed_ids = set(delayed_ids or [])
        self.progress: dict[str, float] = {sid: 0.0 for sid in ROUTES}
        self.connection = None

    # ------------------------------------------------------------------
    # MQTT connection
    # ------------------------------------------------------------------
    def connect(self):
        print(f"Connecting to IoT Core: {IOT_ENDPOINT}")
        self.connection = mqtt_connection_builder.mtls_from_path(
            endpoint=IOT_ENDPOINT,
            port=IOT_PORT,
            cert_filepath=CERT_PATH,
            pri_key_filepath=KEY_PATH,
            ca_filepath=CA_PATH,
            client_id=f"{CLIENT_ID_PREFIX}-simulator",
            clean_session=False,
            keep_alive_secs=30,
        )
        connect_future = self.connection.connect()
        connect_future.result()
        print("Connected to AWS IoT Core ✓")

    def disconnect(self):
        if self.connection:
            disconnect_future = self.connection.disconnect()
            disconnect_future.result()
            print("Disconnected from AWS IoT Core")

    # ------------------------------------------------------------------
    # Event building
    # ------------------------------------------------------------------
    def build_event(self, shipment_id: str) -> dict:
        route = ROUTES[shipment_id]
        progress = self.progress[shipment_id]

        lat, lon, near_city = interpolate_position(route["waypoints"], progress)
        lat, lon = add_gps_noise(lat, lon)

        is_delayed = shipment_id in self.delayed_ids
        status = "DELAYED" if is_delayed else ("DELIVERED" if progress >= 1.0 else "IN_TRANSIT")

        # Simulate variable speed (60–90 km/h on highways)
        speed_kmh = random.uniform(55, 95) if not is_delayed else random.uniform(20, 40)
        total_km = 600  # rough estimate per route
        eta_min = compute_eta_minutes(progress, speed_kmh, total_km)

        return {
            "shipmentId": shipment_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "status": status,
            "nearestCity": near_city,
            "cargo": route["cargo"],
            "routeLabel": route["label"],
            "speedKmh": round(speed_kmh, 1),
            "etaMinutes": eta_min,
            "progress": round(progress, 3),
            "isDelayed": is_delayed,
        }

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    def run(self, interval_sec: float = 3.0, step: float = 0.02):
        print(f"\nSimulating {len(ROUTES)} shipments — publishing every {interval_sec}s")
        print("Press Ctrl+C to stop\n")

        topic_template = "shipments/{shipment_id}/location"

        try:
            while True:
                for shipment_id in ROUTES:
                    event = self.build_event(shipment_id)
                    topic = topic_template.format(shipment_id=shipment_id)
                    payload = json.dumps(event)

                    self.connection.publish(
                        topic=topic,
                        payload=payload,
                        qos=mqtt.QoS.AT_LEAST_ONCE,
                    )

                    status_icon = "🔴" if event["isDelayed"] else "🟢" if event["status"] == "IN_TRANSIT" else "✅"
                    print(
                        f"{status_icon} {shipment_id} | {event['nearestCity']:<20} | "
                        f"{event['latitude']:.4f}, {event['longitude']:.4f} | "
                        f"ETA: {event['etaMinutes']}min | {event['status']}"
                    )

                    # Advance progress (stop at 1.0)
                    if self.progress[shipment_id] < 1.0:
                        jitter = random.uniform(0.8, 1.2)
                        increment = step * jitter
                        if event["isDelayed"]:
                            increment *= 0.3
                        self.progress[shipment_id] = min(1.0, self.progress[shipment_id] + increment)

                print("─" * 80)
                time.sleep(interval_sec)

        except KeyboardInterrupt:
            print("\nSimulator stopped.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Shipment GPS Simulator")
    parser.add_argument(
        "--delay",
        nargs="*",
        default=[],
        metavar="SHIP_ID",
        help="Shipment IDs to mark as delayed (e.g. --delay SHIP-002 SHIP-003)",
    )
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between publishes")
    args = parser.parse_args()

    sim = ShipmentSimulator(delayed_ids=args.delay)
    sim.connect()
    try:
        sim.run(interval_sec=args.interval)
    finally:
        sim.disconnect()
