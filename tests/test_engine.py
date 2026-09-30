"""The simulation must produce operationally plausible outcomes, not random numbers."""

import statistics
from datetime import datetime

import pytest

from engine import Fleet


def ts(value):
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").timestamp()


@pytest.fixture(scope="module")
def outcomes():
    fleet = Fleet(seed=11, start=1_780_000_000)
    final, all_msgs = {}, []
    for _ in range(14 * 96):
        fleet.advance(15)
        msgs = fleet.messages(sent_at=0, significant_only=True)
        all_msgs += msgs
        for m in msgs:
            if m["status"] == "DELIVERED":
                final[m["shipmentId"]] = m
    return list(final.values()), all_msgs


def test_realistic_kpis(outcomes):
    done, _ = outcomes
    assert len(done) > 100
    on_time = sum(ts(m["deliveredAt"]) <= ts(m["plannedDeliveryAt"]) for m in done) / len(done)
    assert 0.75 <= on_time <= 0.97                           # road freight OTD is typically 80–95 %
    g_per_tkm = statistics.median(m["totals"]["co2eKg"] * 1000 / (m["distanceKm"] * m["cargo"]["tonnes"]) for m in done)
    assert 25 <= g_per_tkm <= 110


def test_driving_rules_respected(outcomes):
    _, msgs = outcomes
    assert all(m["driving"]["sinceBreakMin"] <= 271 and m["driving"]["todayMin"] <= 601 for m in msgs)   # 10 h extension allowed
    assert any(m["status"] == "REST" for m in msgs) and any(m["status"] == "BREAK" for m in msgs)


def test_swiss_lanes_clear_customs(outcomes):
    done, _ = outcomes
    ch = {"ZRH", "BSL"}
    swiss = [m for m in done if (m["origin"] in ch) != (m["destination"] in ch)]   # crosses the CH border
    assert swiss and all(m["totals"]["holdMin"]["customs"] > 0 for m in swiss)


def test_reefer_only_on_reefer_trucks_and_ev_range(outcomes):
    done, _ = outcomes
    fleet = Fleet(seed=0)
    reefer = {v["id"] for v in fleet.vehicles if v["reefer"]}
    assert all(m["vehicleId"] in reefer for m in done if m["cargo"]["tempMinC"] is not None)
    max_ev = fleet.params["fuel"]["ELECTRIC"]["maxLaneKm"]
    assert all(m["distanceKm"] <= max_ev for m in done if m["fuelType"] == "ELECTRIC")


def test_sequence_numbers_increase_per_shipment(outcomes):
    _, msgs = outcomes
    last = {}
    for m in msgs:
        assert m["seq"] > last.get(m["shipmentId"], 0)
        last[m["shipmentId"]] = m["seq"]


def test_state_roundtrip():
    import json
    a = Fleet(seed=5, start=1_780_000_000)
    a.advance(600)
    b = Fleet.from_state(json.loads(json.dumps(a.state())))
    b.advance(600)
    assert b.now == a.now + 600 * 60
