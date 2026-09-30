"""Lambda behaviour against mocked DynamoDB/SQS (moto), fed by the real simulation engine."""

import json
import base64

import boto3
import pytest

from conftest import load_handler
from engine import Fleet

START = 1_780_000_000   # fixed sim start for reproducible tests


def kinesis_event(*payloads):
    """Build a Kinesis event; a str payload is sent raw (to test bad JSON)."""
    records = []
    for i, p in enumerate(payloads):
        data = p if isinstance(p, str) else json.dumps(p)
        records.append({"kinesis": {"data": base64.b64encode(data.encode()).decode(), "sequenceNumber": str(i)}})
    return {"Records": records}


def api_event(method, shipment_id=None, body=None, resource="/shipments", params=None,
              origin="http://localhost:3000"):
    return {
        "httpMethod": method,
        "resource": resource + ("/{id}" if shipment_id else ""),
        "pathParameters": {"id": shipment_id} if shipment_id else None,
        "queryStringParameters": params,
        "headers": {"origin": origin},
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"identity": {"apiKeyId": "key123"}},
    }


def body(resp):
    return json.loads(resp["body"])


@pytest.fixture(scope="module")
def history():
    """Four simulated days of fleet telemetry, as the simulator would publish it."""
    fleet = Fleet(seed=7, start=START)
    msgs = []
    for _ in range(4 * 96):
        fleet.advance(15)
        msgs += fleet.messages(sent_at=START, significant_only=True)
    return msgs


def ingest(msgs, process):
    for i in range(0, len(msgs), 100):
        assert process.handler(kinesis_event(*msgs[i:i + 100]), None) == {"batchItemFailures": []}


def test_pipeline_end_to_end(aws, history):
    process, api = load_handler("process_event"), load_handler("api")
    ingest(history, process)

    delivered = {m["shipmentId"]: m for m in history if m["status"] == "DELIVERED"}
    assert len(delivered) >= 15

    metrics = body(api.handler(api_event("GET", resource="/metrics", params={"days": "30"}), None))
    k = metrics["kpis"]
    assert k["delivered"] == len(delivered)
    assert 0.5 <= k["onTimeRate"] <= 1
    assert 20 <= k["gCo2ePerTkm"] <= 120                      # realistic road freight range
    assert k["etaMaeMin"] is not None
    assert sum(d["delivered"] for d in metrics["daily"]) == len(delivered)
    assert metrics["customers"] and metrics["lanes"]

    # Customer view only contains that customer's data
    cid = next(iter(delivered.values()))["customerId"]
    cm = body(api.handler(api_event("GET", resource="/metrics", params={"customerId": cid}), None))
    assert cm["kpis"]["delivered"] == sum(1 for m in delivered.values() if m["customerId"] == cid)
    assert cm["customers"] == []

    live = body(api.handler(api_event("GET", params={"customerId": cid}), None))["shipments"]
    assert live and all(s["customerId"] == cid for s in live)

    # Detail includes an ordered milestone timeline starting at pickup
    sid = next(iter(delivered))
    detail = body(api.handler(api_event("GET", sid), None))
    types = [e["type"] for e in detail["events"]]
    assert types[0] == "PICKUP_STARTED" and "DEPARTED" in types and types[-1] == "DELIVERED"
    assert detail["shipment"]["onTime"] in (True, False)
    assert "ttl" not in detail["shipment"] and "etaAtHalfway" not in detail["shipment"]


def test_duplicates_and_out_of_order_are_ignored(aws, history):
    process = load_handler("process_event")
    sid = history[0]["shipmentId"]
    own = [m for m in history if m["shipmentId"] == sid]
    ingest(own[:3], process)
    ingest([own[1], own[0]], process)                   # replay older messages
    item = aws["table"].get_item(Key={"shipmentId": sid})["Item"]
    assert item["seq"] == own[2]["seq"]


def test_invalid_records_go_to_dlq_not_retried(aws, history):
    process = load_handler("process_event")
    good = history[0]
    result = process.handler(kinesis_event(
        {**good, "latitude": 123},
        {**good, "shipmentId": "bad id!"},
        {**good, "status": "TELEPORTING"},
        "not json",
        good,
    ), None)
    assert result == {"batchItemFailures": []}
    msgs = boto3.client("sqs").receive_message(QueueUrl=aws["queue_url"], MaxNumberOfMessages=10)["Messages"]
    assert len(msgs) == 4
    assert aws["table"].get_item(Key={"shipmentId": good["shipmentId"]}).get("Item")


def test_transient_errors_are_reported_as_batch_failures(aws, history, monkeypatch):
    process = load_handler("process_event")

    def boom(*args, **kwargs):
        raise RuntimeError("throttled")

    monkeypatch.setattr(process, "upsert_state", boom)
    assert process.handler(kinesis_event(history[0]), None) == {"batchItemFailures": [{"itemIdentifier": "0"}]}


def test_operator_flag_survives_next_gps_event(aws, history):
    process, update, api = (load_handler(n) for n in ("process_event", "update_shipment", "api"))
    sid = history[0]["shipmentId"]
    own = [m for m in history if m["shipmentId"] == sid]
    ingest(own[:1], process)

    resp = update.handler(api_event("PUT", sid, {"isDelayed": True, "delayReason": "Customer requested hold"}), None)
    assert resp["statusCode"] == 200
    ingest(own[1:2], process)                           # next ping must not wipe the flag

    shipment = body(api.handler(api_event("GET", sid), None))["shipment"]
    assert shipment["flag"]["reason"] == "Customer requested hold"
    assert "FLAGGED" in shipment["exceptions"]

    update.handler(api_event("PUT", sid, {"isDelayed": False}), None)
    shipment = body(api.handler(api_event("GET", sid), None))["shipment"]
    assert shipment["flag"] is None and "FLAGGED" not in shipment["exceptions"]


def test_update_validation(aws):
    update = load_handler("update_shipment")
    assert update.handler(api_event("PUT", "NOPE", {"isDelayed": True}), None)["statusCode"] == 404
    assert update.handler(api_event("PUT", "X", {"isDelayed": "yes"}), None)["statusCode"] == 400
    assert update.handler(api_event("PUT", "X", {"status": "DELIVERED"}), None)["statusCode"] == 400
    assert update.handler(api_event("PUT", "X", {"isDelayed": True, "delayReason": "x" * 500}), None)["statusCode"] == 400
    bad = api_event("PUT", "X")
    bad["body"] = "{nope"
    assert update.handler(bad, None)["statusCode"] == 400


def test_api_cors_and_404(aws, history):
    process, api = load_handler("process_event"), load_handler("api")
    ingest(history[:5], process)
    ok = api.handler(api_event("GET", origin="https://example.cloudfront.net"), None)
    assert ok["headers"]["Access-Control-Allow-Origin"] == "https://example.cloudfront.net"
    evil = api.handler(api_event("GET", origin="https://evil.example"), None)
    assert evil["headers"]["Access-Control-Allow-Origin"] != "https://evil.example"
    assert api.handler(api_event("GET", "MISSING"), None)["statusCode"] == 404
