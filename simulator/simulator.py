"""
Real-Time Shipment Tracker — GPS Simulator
TU Wien × AWS 2026 — David Fellner

Simulates 10 GPS-equipped trucks sending location events to AWS IoT Core.
Each truck follows a realistic route between European logistics hubs.

ETA calculation: remaining_distance / current_speed × 60
  - remaining_distance = route_total_km × (1 - progress)
  - Simple distance/speed division; not route-aware (no traffic data).
  - Production alternative: AWS Location Service route calculator.

MQTT QoS AT_LEAST_ONCE may deliver duplicates. The Lambda consumer handles
this with an idempotent conditional DynamoDB write (timestamp comparison).
"""

import json
import time
import random
import argparse
from datetime import datetime, timezone
from config import IOT_ENDPOINT, IOT_PORT, CERT_PATH, KEY_PATH, CA_PATH, CLIENT_ID_PREFIX

from awsiot import mqtt_connection_builder
from awscrt import mqtt

# ---------------------------------------------------------------------------
# Route definitions — 10 European logistics routes
# Each route includes actual road-distance estimate (distanceKm) for ETA.
# ---------------------------------------------------------------------------
ROUTES = {
    "SHIP-001": {
        "label":      "Vienna → Hamburg",
        "cargo":      "Electronics",
        "distanceKm": 972,
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (48.5,    14.5,    "Linz"),
            (48.8,    13.0,    "Passau"),
            (48.9,    11.5,    "Regensburg"),
            (49.5,    10.0,    "Nuremberg"),
            (50.1,     8.7,    "Frankfurt"),
            (51.5,     7.5,    "Dortmund"),
            (53.5503,  9.9937, "Hamburg"),
        ],
    },
    "SHIP-002": {
        "label":      "Graz → Paris",
        "cargo":      "Auto Parts",
        "distanceKm": 1240,
        "waypoints": [
            (47.0707, 15.4395, "Graz"),
            (47.8,    13.0,    "Salzburg"),
            (48.1351, 11.5820, "Munich"),
            (48.7,     9.2,    "Stuttgart"),
            (48.6,     7.7,    "Strasbourg"),
            (48.8566,  2.3522, "Paris"),
        ],
    },
    "SHIP-003": {
        "label":      "Vienna → Warsaw",
        "cargo":      "Medical Supplies",
        "distanceKm": 681,
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (49.0,    17.5,    "Brno"),
            (49.8,    18.3,    "Ostrava"),
            (50.0,    19.9,    "Kraków"),
            (52.2297, 21.0122, "Warsaw"),
        ],
    },
    "SHIP-004": {
        "label":      "Vienna → Zürich",
        "cargo":      "Pharmaceuticals",
        "distanceKm": 784,
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (47.8,    13.0,    "Salzburg"),
            (47.3,    11.4,    "Innsbruck"),
            (47.3769,  8.5417, "Zürich"),
        ],
    },
    "SHIP-005": {
        "label":      "Vienna → Lyon",
        "cargo":      "Food & Beverage",
        "distanceKm": 1060,
        "waypoints": [
            (48.2082, 16.3738, "Vienna"),
            (47.8,    13.0,    "Salzburg"),
            (47.3,    11.4,    "Innsbruck"),
            (45.4654,  9.1866, "Milan"),
            (45.07,    7.69,   "Turin"),
            (45.7640,  4.8357, "Lyon"),
        ],
    },
    "SHIP-006": {
        "label":      "Prague → Vienna",
        "cargo":      "Auto Components",
        "distanceKm": 312,
        "waypoints": [
            (50.0755, 14.4378, "Prague"),
            (49.2,    16.6,    "Brno"),
            (48.2082, 16.3738, "Vienna"),
        ],
    },
    "SHIP-007": {
        "label":      "Maranello → Vienna",
        "cargo":      "Luxury Vehicles",
        "distanceKm": 820,
        "waypoints": [
            (44.5249, 10.8632, "Maranello"),
            (44.5,    11.3,    "Bologna"),
            (45.4,    10.9,    "Verona"),
            (47.0,    11.3,    "Innsbruck"),
            (48.2082, 16.3738, "Vienna"),
        ],
    },
    "SHIP-008": {
        "label":      "Salzburg → Prague",
        "cargo":      "Beverages",
        "distanceKm": 385,
        "waypoints": [
            (47.8095, 13.0550, "Salzburg"),
            (48.3,    14.3,    "Linz"),
            (48.6,    13.5,    "Passau"),
            (50.0755, 14.4378, "Prague"),
        ],
    },
    "SHIP-009": {
        "label":      "Budapest → Vienna",
        "cargo":      "Chemical Raw Materials",
        "distanceKm": 244,
        "waypoints": [
            (47.4979, 19.0402, "Budapest"),
            (47.7,    17.6,    "Győr"),
            (48.2082, 16.3738, "Vienna"),
        ],
    },
    "SHIP-010": {
        "label":      "Bucharest → Vienna",
        "cargo":      "Automotive Parts",
        "distanceKm": 1380,
        "waypoints": [
            (44.4268, 26.1025, "Bucharest"),
            (44.8,    24.9,    "Pitești"),
            (45.8,    24.15,   "Sibiu"),
            (46.77,   23.59,   "Cluj-Napoca"),
            (47.1,    22.0,    "Oradea"),
            (47.4979, 19.0402, "Budapest"),
            (48.2082, 16.3738, "Vienna"),
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
    segment_idx  = min(int(progress / segment_size), len(waypoints) - 2)
    local_t      = (progress - segment_idx * segment_size) / segment_size

    a = waypoints[segment_idx]
    b = waypoints[segment_idx + 1]
    lat  = a[0] + (b[0] - a[0]) * local_t
    lon  = a[1] + (b[1] - a[1]) * local_t
    city = a[2] if local_t < 0.5 else b[2]
    return lat, lon, city


def add_gps_noise(lat: float, lon: float, noise_m: float = 50) -> tuple[float, float]:
    """Add realistic GPS noise (default ±50 m)."""
    noise_deg = noise_m / 111_000
    return (
        lat + random.gauss(0, noise_deg),
        lon + random.gauss(0, noise_deg),
    )


def compute_eta_minutes(progress: float, speed_kmh: float, total_km: float) -> int:
    """ETA = remaining_km / speed × 60 (simple distance/speed division)."""
    remaining_km = max(0.0, total_km * (1.0 - progress))
    if speed_kmh <= 0:
        return 9999
    return int((remaining_km / speed_kmh) * 60)


class ShipmentSimulator:
    def __init__(self, delayed_ids: list[str] = None):
        self.delayed_ids = set(delayed_ids or [])
        self.progress: dict[str, float] = {sid: 0.0 for sid in ROUTES}
        self.connection = None

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
        self.connection.connect().result()
        print(f"Connected to AWS IoT Core  ({len(ROUTES)} shipments active)")

    def disconnect(self):
        if self.connection:
            self.connection.disconnect().result()
            print("Disconnected from AWS IoT Core")

    def build_event(self, shipment_id: str) -> dict:
        route    = ROUTES[shipment_id]
        progress = self.progress[shipment_id]

        lat, lon, near_city = interpolate_position(route["waypoints"], progress)
        lat, lon = add_gps_noise(lat, lon)

        is_delayed = shipment_id in self.delayed_ids
        if progress >= 1.0:
            status = "DELIVERED"
        elif is_delayed:
            status = "DELAYED"
        else:
            status = "IN_TRANSIT"

        speed_kmh = random.uniform(20, 40) if is_delayed else random.uniform(55, 95)
        eta_min   = compute_eta_minutes(progress, speed_kmh, route["distanceKm"])

        return {
            "shipmentId":  shipment_id,
            "timestamp":   datetime.now(timezone.utc).isoformat(),
            "latitude":    round(lat, 6),
            "longitude":   round(lon, 6),
            "status":      status,
            "nearestCity": near_city,
            "cargo":       route["cargo"],
            "routeLabel":  route["label"],
            "speedKmh":    round(speed_kmh, 1),
            "etaMinutes":  eta_min,
            "progress":    round(progress, 3),
            "isDelayed":   is_delayed,
        }

    def run(self, interval_sec: float = 3.0, step: float = 0.015):
        print(f"\nSimulating {len(ROUTES)} shipments — publishing every {interval_sec}s")
        print("Delayed:", sorted(self.delayed_ids) or "none")
        print("Press Ctrl+C to stop\n")

        topic_tmpl = "shipments/{shipment_id}/location"

        try:
            while True:
                for shipment_id in ROUTES:
                    event   = self.build_event(shipment_id)
                    topic   = topic_tmpl.format(shipment_id=shipment_id)

                    self.connection.publish(
                        topic=topic,
                        payload=json.dumps(event),
                        qos=mqtt.QoS.AT_LEAST_ONCE,
                    )

                    icon = "🔴" if event["isDelayed"] else ("✅" if event["status"] == "DELIVERED" else "🟢")
                    print(
                        f"{icon} {shipment_id} | {event['nearestCity']:<22} | "
                        f"{event['speedKmh']:>5.1f} km/h | ETA: {event['etaMinutes']:>4}min | {event['status']}"
                    )

                    if self.progress[shipment_id] < 1.0:
                        inc = step * random.uniform(0.8, 1.2)
                        if event["isDelayed"]:
                            inc *= 0.3
                        self.progress[shipment_id] = min(1.0, self.progress[shipment_id] + inc)

                print("─" * 88)
                time.sleep(interval_sec)

        except KeyboardInterrupt:
            print("\nSimulator stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Shipment GPS Simulator — 10 European routes")
    parser.add_argument(
        "--delay",
        nargs="*",
        default=[],
        metavar="SHIP_ID",
        help="Shipment IDs to mark as delayed (e.g. --delay SHIP-002 SHIP-008)",
    )
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between publish cycles")
    args = parser.parse_args()

    sim = ShipmentSimulator(delayed_ids=args.delay)
    sim.connect()
    try:
        sim.run(interval_sec=args.interval)
    finally:
        sim.disconnect()
