"""
Fleet simulation engine — realistic truck operations on real road geometry.

Pure logic, no I/O besides reading shared/*.json: the MQTT publisher
(simulator.py) and the tests drive it. dashboard/src/sim/engine.js is a
JavaScript port used for the zero-setup mock mode; keep both in sync.

Model (1-minute steps, simulated clock):
  - Lanes follow OSRM road geometry; truck speed = country limit (+ limiter
    tolerance), urban speed near hubs, random traffic jams (rush hours near cities).
  - EU driving rules (561/2006, simplified): 45 min break after 4.5 h driving,
    11 h rest after 9 h daily driving.
  - Borders: customs clearance entering/leaving Switzerland, random Schengen
    spot checks at DE/AT/FR/NL.
  - Fuel/energy, CO2e (well-to-wheel), tolls per country.
  - Reefer trailers: temperature control with occasional unit faults → excursions.
  - Plans: pickup/delivery windows planned with the driver's real hours state;
    ETA is re-predicted continuously (without knowing future jams/checks), so
    on-time rate and ETA accuracy are genuine outcomes, not random numbers.
"""

import json
import math
import random
from bisect import bisect_right
from datetime import datetime, timezone
from pathlib import Path

SHARED = Path(__file__).resolve().parent.parent / "shared"
ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def load_json(name: str) -> dict:
    return json.loads((SHARED / name).read_text(encoding="utf-8"))


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Lane:
    def __init__(self, raw: dict):
        self.id       = raw["id"]
        self.src      = raw["from"]
        self.dst      = raw["to"]
        self.label    = raw["label"]
        self.km       = raw["distanceKm"]
        self.coords   = raw["coords"]
        self.cum      = raw["cumKm"]
        self.segments = raw["segments"]

    def position(self, km: float) -> tuple[float, float, float]:
        """(lat, lon, heading°) at distance km along the lane."""
        i = max(0, min(bisect_right(self.cum, km) - 1, len(self.cum) - 2))
        span = (self.cum[i + 1] - self.cum[i]) or 1e-9
        t = max(0.0, min(1.0, (km - self.cum[i]) / span))
        (x1, y1), (x2, y2) = self.coords[i], self.coords[i + 1]
        lon, lat = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
        dx = math.radians(x2 - x1) * math.cos(math.radians((y1 + y2) / 2))
        heading = (math.degrees(math.atan2(dx, math.radians(y2 - y1))) + 360) % 360
        return lat, lon, heading

    def country(self, km: float) -> str:
        for s in self.segments:
            if km < s["endKm"]:
                return s["country"]
        return self.segments[-1]["country"]

    def crossings_after(self, km: float) -> list[tuple[str, str]]:
        return [(a["country"], b["country"]) for a, b in zip(self.segments, self.segments[1:])
                if b["startKm"] > km]


class Fleet:
    def __init__(self, seed: int | None = None, start: float | None = None):
        self.rng     = random.Random(seed)
        self.params  = load_json("params.json")
        self.catalog = load_json("catalog.json")
        network      = load_json("network.json")
        self.hubs    = network["hubs"]
        self.lanes   = {l["id"]: Lane(l) for l in network["lanes"]}
        self.now     = start if start is not None else datetime.now(timezone.utc).timestamp()
        self.vehicles = [self._new_vehicle(v) for v in self.catalog["vehicles"]]
        # Stagger shifts so drivers don't all break/rest at the same time
        for v in self.vehicles:
            v["modeUntil"]     = self.now + self.rng.uniform(0, 720) * 60
            v["todayMin"]      = self.rng.uniform(0, 500)
            v["sinceBreakMin"] = self.rng.uniform(0, min(200, v["todayMin"]))

    # ── setup ─────────────────────────────────────────────────────────────
    def _new_vehicle(self, spec: dict) -> dict:
        return {
            **spec, "hub": spec["home"], "mode": "IDLE", "modeUntil": 0.0,
            "sinceBreakMin": 0.0, "todayMin": 0.0,
            "shipment": None, "outbox": [],
        }

    def _rand(self, lo_hi) -> float:
        return self.rng.uniform(*lo_hi)

    def _new_id(self) -> str:
        yy = datetime.fromtimestamp(self.now, timezone.utc).strftime("%y")
        return f"AFL-{yy}-" + "".join(self.rng.choice(ID_ALPHABET) for _ in range(5))

    def _pick_job(self, v: dict):
        """Pick (lane, customerId, cargo) for a truck that is free at its current hub."""
        fuel_cfg = self.params["fuel"][v["fuel"]]
        lanes = [l for l in self.lanes.values()
                 if l.src == v["hub"] and l.km <= fuel_cfg.get("maxLaneKm", 1e9)]
        if not lanes:   # electric truck stranded at a far hub: reposition via shortest lane
            lanes = [min((l for l in self.lanes.values() if l.src == v["hub"]), key=lambda l: l.km)]
        options = []
        for lane in lanes:
            for cid, c in self.catalog["customers"].items():
                weight = 3 if (lane.src in c["hubs"] and lane.dst in c["hubs"]) else \
                         1 if (lane.src in c["hubs"] or lane.dst in c["hubs"]) else 0
                for cargo in c["cargo"]:
                    if weight and ("tempC" not in cargo or v["reefer"]):
                        options += [(lane, cid, cargo)] * weight
        if not options:
            lane = self.rng.choice(lanes)
            cid, cargo = self.rng.choice([(k, cg) for k, c in self.catalog["customers"].items()
                                          for cg in c["cargo"] if "tempC" not in cg])
            options = [(lane, cid, cargo)]
        return self.rng.choice(options)

    def _party(self, cust: dict, hub: str, index: int) -> dict:
        """Shipper/consignee at a hub: the customer's own site, or a receiving company there."""
        city = self.hubs[hub]["name"]
        if hub in cust["sites"]:
            return {"name": cust["name"], "site": cust["sites"][hub], "city": city}
        pool = self.catalog["consignees"][hub]
        return {"name": pool[index % len(pool)], "site": f"Receiving dock, {city}", "city": city}

    def _documents(self, lane: Lane, cargo: dict) -> list[str]:
        docs = ["CMR consignment note", "Commercial invoice", "Packing list"]
        if any(self._is_customs(a, b) for a, b in lane.crossings_after(0)):
            docs += ["Export declaration (EAD)", "Transit document T1"]
        if cargo.get("adr"):
            docs.append(f"ADR transport document (class {cargo['adr']['class']}, {cargo['adr']['un']})")
        if cargo.get("tempC"):
            docs.append("Reefer temperature log")
        return docs

    def _start_shipment(self, v: dict) -> None:
        lane, cid, cargo = self._pick_job(v)
        cust  = self.catalog["customers"][cid]
        temp  = cargo.get("tempC")
        yy    = datetime.fromtimestamp(self.now, timezone.utc).strftime("%y")
        ops   = self.params["operations"]
        s = {
            "shipmentId": self._new_id(), "seq": 0,
            "customerId": cid, "laneId": lane.id,
            "orderRef": f"PO-{cid[5:]}-{self.rng.randint(100000, 999999)}",
            "cmrNo": f"CMR-{yy}-{self.rng.randint(1000000, 9999999)}",
            "shipper": self._party(cust, lane.src, self.rng.randrange(9)),
            "consignee": self._party(cust, lane.dst, self.rng.randrange(9)),
            "documents": self._documents(lane, cargo),
            "pod": None,
            "cargo": {
                "type": cargo["type"], "hsCode": cargo["hsCode"], "packaging": cargo["packaging"],
                "adr": cargo.get("adr"),
                "tonnes": round(self._rand(cargo["tonnes"]), 1),
                "pallets": int(self._rand(cargo["pallets"])),
                "valueEur": int(self._rand(cargo["valueEur"]) // 100 * 100),
                "tempMinC": temp[0] if temp else None,
                "tempMaxC": temp[1] if temp else None,
            },
            "km": 0.0, "status": "LOADING",
            "plannedPickupAt": self.now + 45 * 60,
            "departedAt": None, "deliveredAt": None,
            "reeferTempC": (temp[0] + temp[1]) / 2 if temp else None,
            "fault": None, "excursion": False, "jam": None, "hold": None,
            "etaBaseline": None, "halfwayFlag": False,
            "totals": {"co2eKg": 0.0, "fuelUnits": 0.0, "fuelEur": 0.0, "tollEur": 0.0,
                       "holdMin": {"customs": 0.0, "spotCheck": 0.0, "traffic": 0.0},
                       "breakMin": 0.0, "restMin": 0.0,
                       "tempExcursionMin": 0.0, "tempExcursions": 0, "maxTempC": None},
            "events": [],
        }
        v["shipment"] = s
        # Plan with the driver's actual hours (a dispatcher sees the tachograph)
        drive_min = self._drive_minutes(lane, 0.0)
        wait_min  = self._hos_wait(drive_min, v["sinceBreakMin"], v["todayMin"])
        drive_min *= self.params["planningTrafficFactor"]          # allowance for congestion
        customs   = sum(1 for a, b in lane.crossings_after(0) if self._is_customs(a, b))
        transit   = drive_min + wait_min + customs * 60 + 45
        s["plannedDeliveryAt"] = s["plannedPickupAt"] + (transit + self._rand(cust["slackMin"]) * self.params["bookingSlackFactor"]) * 60
        v["mode"], v["modeUntil"] = "LOADING", self.now + self._rand(ops["loadingMin"]) * 60
        self._event(v, "PICKUP_STARTED", {"hub": lane.src})

    # ── helpers ───────────────────────────────────────────────────────────
    def _cruise_kmh(self, country: str) -> float:
        return min(self.params["truckSpeedLimitKmh"].get(country, 80) + 4, 89)

    def _is_customs(self, a: str, b: str) -> bool:
        cc = self.params["borders"]["customsCountries"]
        return a in cc or b in cc

    def _drive_minutes(self, lane: Lane, from_km: float) -> float:
        """Expected driving minutes from `from_km` to the end of the lane."""
        urban, urban_v = self.params["urbanKm"], self.params["urbanSpeedKmh"]
        total = 0.0
        for seg in lane.segments:
            a, b = max(seg["startKm"], from_km), seg["endKm"]
            if b > a:
                total += (b - a) / self._cruise_kmh(seg["country"]) * 60
        # Urban stretches (origin if not yet left, destination) run at city speed
        for start, end in ((from_km, urban), (max(from_km, lane.km - urban), lane.km)):
            if end > start:
                cruise = self._cruise_kmh(lane.country(start))
                total += (end - start) * (60 / urban_v - 60 / cruise)
        return total

    def _hos_wait(self, drive_min: float, since: float, today: float) -> float:
        """Minutes of mandatory breaks/rests needed to drive `drive_min` more minutes.

        Mirrors the decision order of _drive() exactly: arrive if done; daily rest if the
        daily limit is reached and the trip cannot be finished within the 10 h extension;
        otherwise a 45 min break when 4.5 h of continuous driving are reached."""
        hos, wait = self.params["hos"], 0.0
        while drive_min > 1e-9:
            extend = drive_min <= hos["extendedDailyDrivingMin"] - today
            if today >= hos["maxDailyDrivingMin"] and not extend:
                wait, since, today = wait + hos["dailyRestMin"], 0.0, 0.0
                continue
            if since >= hos["maxContinuousDrivingMin"]:
                wait, since = wait + hos["breakMin"], 0.0
                continue
            limits = [drive_min, hos["maxContinuousDrivingMin"] - since]
            if today < hos["maxDailyDrivingMin"]:
                limits.append(hos["maxDailyDrivingMin"] - today)
            step = min(limits)
            drive_min, since, today = drive_min - step, since + step, today + step
        return wait

    def _event(self, v: dict, kind: str, data: dict | None = None) -> None:
        s = v["shipment"]
        lane = self.lanes[s["laneId"]]
        lat, lon, _ = lane.position(s["km"])
        s["events"].append({"type": kind, "at": iso(self.now), "lat": round(lat, 5),
                            "lon": round(lon, 5), "country": lane.country(s["km"]), **({"data": data} if data else {})})

    def eta(self, v: dict) -> float:
        s = v["shipment"]
        lane = self.lanes[s["laneId"]]
        t, since, today = self.now, v["sinceBreakMin"], v["todayMin"]
        if v["mode"] in ("LOADING", "BREAK", "REST", "HOLD"):
            t = max(t, v["modeUntil"])
            if v["mode"] == "BREAK":
                since = 0
            if v["mode"] == "REST":
                since = today = 0
        if v["mode"] == "UNLOADING":
            return max(v["modeUntil"], self.now)
        drive = self._drive_minutes(lane, s["km"])
        wait  = self._hos_wait(drive, since, today)
        customs = sum(1 for a, b in lane.crossings_after(s["km"]) if self._is_customs(a, b))
        return t + (drive + wait + customs * 60 + 45) * 60

    # ── simulation ────────────────────────────────────────────────────────
    def advance(self, minutes: float) -> None:
        """Advance the whole fleet by `minutes` of simulated time (1-min steps)."""
        self._carry = getattr(self, "_carry", 0.0) + minutes
        steps = int(self._carry + 1e-9)
        self._carry -= steps
        for _ in range(steps):
            self.now += 60
            for v in self.vehicles:
                self._step(v)

    def _step(self, v: dict) -> None:
        s, mode = v["shipment"], v["mode"]
        ops = self.params["operations"]

        if mode == "IDLE":
            if self.now >= v["modeUntil"]:
                self._start_shipment(v)
            return

        if s:
            self._reefer(v)

        if mode == "DRIVING":
            self._drive(v)
            return

        # timed modes
        if mode == "BREAK":
            s["totals"]["breakMin"] += 1
        elif mode == "REST":
            s["totals"]["restMin"] += 1
        elif mode == "HOLD":
            s["totals"]["holdMin"][s["hold"]] += 1
        if self.now < v["modeUntil"]:
            return

        if mode == "LOADING":
            s["status"], s["departedAt"] = "IN_TRANSIT", self.now
            v["mode"] = "DRIVING"
            self._event(v, "DEPARTED")
            s["etaBaseline"] = self.eta(v)
        elif mode == "BREAK":
            v["sinceBreakMin"] = 0
            v["mode"], s["status"] = "DRIVING", "IN_TRANSIT"
            self._event(v, "DRIVING_RESUMED")
        elif mode == "REST":
            v["sinceBreakMin"] = v["todayMin"] = 0
            v["mode"], s["status"] = "DRIVING", "IN_TRANSIT"
            self._event(v, "DRIVING_RESUMED")
        elif mode == "HOLD":
            kind = s["hold"]
            self._event(v, "HOLD_ENDED", {"kind": kind, "minutes": round(s["_holdLen"])})
            s["hold"] = None
            v["mode"], s["status"] = "DRIVING", "IN_TRANSIT"
        elif mode == "UNLOADING":
            s["status"], s["deliveredAt"] = "DELIVERED", self.now
            s["pod"] = {"signedBy": self.rng.choice(self.catalog["signatories"]), "at": iso(self.now),
                        "remarks": "Accepted, temperature log attached" if s["totals"]["tempExcursions"]
                                   else "Received in good condition"}
            self._event(v, "DELIVERED", {"pallets": s["cargo"]["pallets"], "signedBy": s["pod"]["signedBy"]})
            v["outbox"].append(s)            # final message still to be published
            v["hub"] = self.lanes[s["laneId"]].dst
            v["shipment"] = None
            v["mode"], v["modeUntil"] = "TURNAROUND", self.now + self._rand(ops["turnaroundMin"]) * 60
        elif mode == "TURNAROUND":
            v["sinceBreakMin"] = 0            # turnaround ≥ 30 min counts as a break
            v["mode"], v["modeUntil"] = "IDLE", self.now

    def _drive(self, v: dict) -> None:
        s = v["shipment"]
        lane = self.lanes[s["laneId"]]
        p, tr = self.params, self.params["traffic"]
        country = lane.country(s["km"])
        near_city = s["km"] < tr["nearCityKm"] or s["km"] > lane.km - tr["nearCityKm"]
        hour = datetime.fromtimestamp(self.now, timezone.utc).hour + 1   # ≈ CET
        rush = any(a <= hour < b for a, b in tr["rushHours"])

        # Traffic
        if s["jam"] and s["km"] >= s["jam"]["untilKm"]:
            s["jam"] = None
        if not s["jam"]:
            chance = tr["jamChancePerHourNearCity"] if (near_city and rush) else tr["jamChancePerHourOpenRoad"]
            if self.rng.random() < chance / 60:
                length = self._rand(tr["jamLengthKm"])
                s["jam"] = {"untilKm": s["km"] + length, "speed": self._rand(tr["jamSpeedKmh"])}
                self._event(v, "TRAFFIC_JAM", {"lengthKm": round(length, 1)})

        if s["jam"]:
            speed = s["jam"]["speed"]
            cruise = self._cruise_kmh(country)
            s["totals"]["holdMin"]["traffic"] += max(0.0, 1 - speed / cruise)   # minutes lost
        elif s["km"] < p["urbanKm"] or s["km"] > lane.km - p["urbanKm"]:
            speed = p["urbanSpeedKmh"] + self.rng.gauss(0, 4)
        else:
            speed = self._cruise_kmh(country) + self.rng.gauss(0, 2.5)
        speed = max(5.0, speed)
        s["speedKmh"] = speed

        before = s["km"]
        s["km"] = min(lane.km, s["km"] + speed / 60)
        dkm = s["km"] - before

        # Energy, emissions, tolls
        f = p["fuel"][v["fuel"]]
        units = (f["baseper100km"] + f["perTonne"] * s["cargo"]["tonnes"]) / 100 * dkm
        t = s["totals"]
        t["fuelUnits"] += units
        t["co2eKg"]    += units * f["kgCo2ePerUnit"]
        t["fuelEur"]   += units * f["eurPerUnit"]
        t["tollEur"]   += p["tollEurPerKm"].get(country, 0.2) * dkm

        v["sinceBreakMin"] += 1
        v["todayMin"]      += 1
        if not s["halfwayFlag"] and s["km"] >= lane.km / 2:
            s["halfwayFlag"] = True
            s["_halfway"] = True

        # Border crossing
        new_country = lane.country(s["km"])
        if new_country != country:
            self._event(v, "BORDER_CROSSED", {"from": country, "to": new_country})
            b = p["borders"]
            hold = None
            if self._is_customs(country, new_country):
                hold, minutes = "customs", self._rand(b["customsHoldMin"])
            elif new_country in b["spotCheckCountries"] and self.rng.random() < b["spotCheckChance"]:
                hold, minutes = "spotCheck", self._rand(b["spotCheckHoldMin"])
            if hold:
                s["hold"], s["_holdLen"], s["status"] = hold, minutes, "BORDER_HOLD"
                v["mode"], v["modeUntil"] = "HOLD", self.now + minutes * 60
                self._event(v, "HOLD_STARTED", {"kind": hold})
                return

        if s["km"] >= lane.km:
            s["status"], s["speedKmh"] = "UNLOADING", 0
            v["mode"], v["modeUntil"] = "UNLOADING", self.now + self._rand(p["operations"]["unloadingMin"]) * 60
            self._event(v, "ARRIVED", {"hub": lane.dst})
            return

        hos = p["hos"]
        extend = self._drive_minutes(lane, s["km"]) <= hos["extendedDailyDrivingMin"] - v["todayMin"]
        if v["todayMin"] >= hos["maxDailyDrivingMin"] and not extend:
            s["status"], s["speedKmh"] = "REST", 0
            v["mode"], v["modeUntil"] = "REST", self.now + hos["dailyRestMin"] * 60
            self._event(v, "REST_STARTED")
        elif v["sinceBreakMin"] >= hos["maxContinuousDrivingMin"]:
            s["status"], s["speedKmh"] = "BREAK", 0
            v["mode"], v["modeUntil"] = "BREAK", self.now + hos["breakMin"] * 60
            self._event(v, "BREAK_STARTED")

        # ETA drift announcements (every 15 sim-min)
        if int(self.now / 60) % 15 == 0 and s["etaBaseline"]:
            eta = self.eta(v)
            if abs(eta - s["etaBaseline"]) >= p["operations"]["etaChangeEventMin"] * 60:
                self._event(v, "ETA_CHANGED", {"from": iso(s["etaBaseline"]), "to": iso(eta)})
                s["etaBaseline"] = eta

    def _reefer(self, v: dict) -> None:
        s = v["shipment"]
        c = s["cargo"]
        if c["tempMinC"] is None:
            return
        r = self.params["reefer"]
        lo, hi = c["tempMinC"], c["tempMaxC"]
        setpoint = (lo + hi) / 2
        if s["fault"]:
            s["reeferTempC"] += r["faultDriftCPerHour"] / 60
            if self.now >= s["fault"]:
                s["fault"] = None
        else:
            s["reeferTempC"] += (setpoint - s["reeferTempC"]) * 0.08 + self.rng.gauss(0, r["noiseC"] * 0.3)
            if v["mode"] == "DRIVING" and self.rng.random() < r["faultChancePerHour"] / 60:
                s["fault"] = self.now + self._rand(r["faultDurationMin"]) * 60
        temp = s["reeferTempC"]
        out = temp > hi or temp < lo
        t = s["totals"]
        if out:
            t["tempExcursionMin"] += 1
            t["maxTempC"] = round(max(t["maxTempC"] or temp, temp), 1)
            if not s["excursion"]:
                s["excursion"] = True
                t["tempExcursions"] += 1
                self._event(v, "TEMP_EXCURSION", {"tempC": round(temp, 1), "limitC": hi if temp > hi else lo})
        elif s["excursion"]:
            s["excursion"] = False
            self._event(v, "TEMP_RECOVERED", {"tempC": round(temp, 1)})

    # ── messages ──────────────────────────────────────────────────────────
    def _message(self, v: dict, s: dict, sent_at: float) -> dict:
        lane  = self.lanes[s["laneId"]]
        cust  = self.catalog["customers"][s["customerId"]]
        lat, lon, heading = lane.position(s["km"])
        s["seq"] += 1
        done = s["status"] == "DELIVERED"
        t = s["totals"]
        msg = {
            "schema": 2,
            "shipmentId": s["shipmentId"], "seq": s["seq"],
            "sentAt": iso(sent_at), "simTime": iso(self.now),
            "customerId": s["customerId"], "customerName": cust["name"],
            "laneId": lane.id, "routeLabel": lane.label,
            "origin": lane.src, "destination": lane.dst,
            "originName": self.hubs[lane.src]["name"], "destinationName": self.hubs[lane.dst]["name"],
            "vehicleId": v["id"], "plate": v["plate"], "vehicleModel": v["model"], "fuelType": v["fuel"],
            "driverId": v["driver"], "driverName": self.catalog["drivers"][v["driver"]]["name"],
            "orderRef": s["orderRef"], "cmrNo": s["cmrNo"],
            "shipper": s["shipper"], "consignee": s["consignee"],
            "documents": s["documents"], "pod": s["pod"],
            "cargo": s["cargo"],
            "status": s["status"],
            "latitude": round(lat, 5), "longitude": round(lon, 5), "heading": round(heading),
            "speedKmh": round(s.get("speedKmh", 0) if v["mode"] == "DRIVING" and not done else 0, 1),
            "country": lane.country(s["km"]),
            "distanceKm": lane.km, "distanceDoneKm": round(s["km"], 1),
            "progress": round(s["km"] / lane.km, 4),
            "plannedPickupAt": iso(s["plannedPickupAt"]), "plannedDeliveryAt": iso(s["plannedDeliveryAt"]),
            "departedAt": iso(s["departedAt"]) if s["departedAt"] else None,
            "etaAt": iso(s["deliveredAt"] if done else self.eta(v)),
            "deliveredAt": iso(s["deliveredAt"]) if done else None,
            "reeferTempC": round(s["reeferTempC"], 1) if s["reeferTempC"] is not None else None,
            "driving": {"sinceBreakMin": round(v["sinceBreakMin"]), "todayMin": round(v["todayMin"])},
            "totals": {
                "co2eKg": round(t["co2eKg"], 1), "fuelUnits": round(t["fuelUnits"], 1),
                "fuelUnit": self.params["fuel"][v["fuel"]]["unit"],
                "fuelEur": round(t["fuelEur"], 2), "tollEur": round(t["tollEur"], 2),
                "holdMin": {k: round(x) for k, x in t["holdMin"].items()},
                "breakMin": round(t["breakMin"]), "restMin": round(t["restMin"]),
                "tempExcursionMin": round(t["tempExcursionMin"]), "tempExcursions": t["tempExcursions"],
                "maxTempC": t["maxTempC"],
            },
            "events": s["events"],
        }
        s["events"] = []
        s["_halfway"] = False
        s["_lastPub"] = self.now
        return msg

    def messages(self, sent_at: float | None = None, significant_only: bool = False,
                 heartbeat_min: float = 120) -> list[dict]:
        """Telemetry for every active shipment (plus final messages of just-delivered ones).

        significant_only: only shipments with new events, a halfway crossing, or no
        message for `heartbeat_min` (used for fast history backfill)."""
        sent_at = sent_at if sent_at is not None else datetime.now(timezone.utc).timestamp()
        out = []
        for v in self.vehicles:
            for s in v["outbox"]:
                out.append(self._message(v, s, sent_at))
            v["outbox"] = []
            s = v["shipment"]
            if not s:
                continue
            if significant_only and not (s["events"] or s.get("_halfway")
                                         or self.now - s.get("_lastPub", 0) >= heartbeat_min * 60):
                continue
            out.append(self._message(v, s, sent_at))
        return out

    # ── persistence ───────────────────────────────────────────────────────
    def state(self) -> dict:
        return {"now": self.now, "vehicles": self.vehicles}

    @classmethod
    def from_state(cls, state: dict, seed: int | None = None) -> "Fleet":
        fleet = cls(seed=seed, start=state["now"])
        fleet.vehicles = state["vehicles"]
        return fleet
