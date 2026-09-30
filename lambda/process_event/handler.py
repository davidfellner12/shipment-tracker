"""
Lambda: process_event
Triggered by Kinesis Data Stream (fed by the IoT Core rule).

For each telemetry message:
  1. validate it (poison records → DLQ, never retried)
  2. append its milestone events to the events table (history / timeline)
  3. upsert the shipment's current state — only if the message's per-shipment
     sequence number is newer than the stored one (idempotent, order-safe)

Only telemetry attributes are written. Operator-owned attributes set by
update_shipment (manualDelay, delayReason) are never touched, so a manual flag
survives the next GPS ping.

Failure handling: transient errors are reported as partial batch failures
(ReportBatchItemFailures) so Lambda retries from the failed record; after the
configured retries the event source mapping sends batch metadata to the DLQ.
"""

import os
import re
import json
import time
import base64
import logging
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb     = boto3.resource("dynamodb")
sqs          = boto3.client("sqs")
table        = dynamodb.Table(os.environ["SHIPMENTS_TABLE"])
events_table = dynamodb.Table(os.environ["EVENTS_TABLE"])
DLQ_URL      = os.environ.get("DLQ_URL")

ACTIVE_TTL_S    = 7 * 86_400     # in-transit shipments with no ping for a week expire
DELIVERED_TTL_S = 90 * 86_400    # delivered shipments are kept 90 days for reporting
ID_RE    = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
STATUSES = {"LOADING", "IN_TRANSIT", "BREAK", "REST", "BORDER_HOLD", "UNLOADING", "DELIVERED"}

# Attributes copied from the message into the shipment item
STATE_FIELDS = [
    "seq", "simTime", "sentAt", "customerId", "customerName", "laneId", "routeLabel",
    "origin", "destination", "originName", "destinationName",
    "vehicleId", "plate", "vehicleModel", "fuelType", "driverId", "driverName",
    "orderRef", "cmrNo", "shipper", "consignee", "documents", "pod",
    "cargo", "status", "latitude", "longitude", "heading", "speedKmh", "country",
    "distanceKm", "distanceDoneKm", "progress",
    "plannedPickupAt", "plannedDeliveryAt", "departedAt", "etaAt", "deliveredAt",
    "reeferTempC", "driving", "totals",
]


class InvalidEvent(ValueError):
    """Payload can never be processed — route to DLQ, do not retry."""


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_record(record: dict) -> dict:
    try:
        raw = base64.b64decode(record["kinesis"]["data"]).decode("utf-8")
        msg = json.loads(raw, parse_float=Decimal)
    except (KeyError, ValueError, UnicodeDecodeError) as exc:
        raise InvalidEvent(f"undecodable record: {exc}") from exc
    if not isinstance(msg, dict):
        raise InvalidEvent("payload is not a JSON object")

    sid = msg.get("shipmentId")
    if not isinstance(sid, str) or not ID_RE.match(sid):
        raise InvalidEvent(f"invalid shipmentId: {sid!r}")
    if not isinstance(msg.get("seq"), int) or msg["seq"] < 1:
        raise InvalidEvent("missing/invalid seq")
    if msg.get("status") not in STATUSES:
        raise InvalidEvent(f"invalid status: {msg.get('status')!r}")
    if not isinstance(msg.get("customerId"), str) or not ID_RE.match(msg["customerId"]):
        raise InvalidEvent("missing/invalid customerId")
    try:
        parse_ts(msg["simTime"])
        parse_ts(msg["plannedDeliveryAt"])
        lat, lon = float(msg["latitude"]), float(msg["longitude"])
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidEvent(f"missing/invalid time or coordinates: {exc}") from exc
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise InvalidEvent(f"coordinates out of range: {lat}, {lon}")
    if not isinstance(msg.get("events", []), list):
        raise InvalidEvent("events must be a list")
    return msg


def write_events(msg: dict, now: int) -> None:
    """Idempotent: the sort key is derived from the event itself, so a replay overwrites."""
    events = msg.get("events") or []
    if not events:
        return
    with events_table.batch_writer(overwrite_by_pkeys=["shipmentId", "sk"]) as batch:
        for i, e in enumerate(events):
            batch.put_item(Item={
                "shipmentId": msg["shipmentId"],
                "sk":         f"{e.get('at', msg['simTime'])}#{msg['seq']:06d}#{i:02d}",
                "customerId": msg["customerId"],
                **{k: v for k, v in e.items() if v is not None},
                "ttl":        now + DELIVERED_TTL_S,
            })


def upsert_state(msg: dict, now: int) -> None:
    item = {k: msg[k] for k in STATE_FIELDS if k in msg}
    item["lastSeenAt"] = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    item["ttl"] = now + (DELIVERED_TTL_S if msg["status"] == "DELIVERED" else ACTIVE_TTL_S)
    try:
        latency = (time.time() - parse_ts(msg["sentAt"]).timestamp()) * 1000
        if 0 <= latency < 3_600_000:          # ignore backfill/clock-skewed messages
            item["ingestLatencyMs"] = int(latency)
    except (KeyError, ValueError):
        pass

    names  = {f"#a{i}": k for i, k in enumerate(item)}
    values = {f":v{i}": v for i, v in enumerate(item.values())}
    sets   = [f"#a{i} = :v{i}" for i in range(len(item))]
    seq_ref = next(n for n, k in names.items() if k == "seq")

    table.update_item(
        Key={"shipmentId": msg["shipmentId"]},
        UpdateExpression="SET " + ", ".join(sets),
        # no seq yet (new shipment, or only the halfway ETA recorded) or an older one
        ConditionExpression=f"attribute_not_exists({seq_ref}) OR {seq_ref} < :newseq",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={**values, ":newseq": msg["seq"]},
    )


def record_halfway_eta(msg: dict) -> None:
    """Keep the ETA predicted when the truck passed halfway (for the ETA-accuracy KPI).

    Must not depend on arrival order: of all messages in the halfway window, the one
    with the lowest sequence number wins, enforced by a conditional write."""
    progress = float(msg.get("progress", 0))
    if not (0.5 <= progress < 0.65) or msg["status"] == "DELIVERED":
        return
    try:
        table.update_item(
            Key={"shipmentId": msg["shipmentId"]},
            UpdateExpression="SET etaAtHalfway = :eta, halfwaySeq = :seq",
            ConditionExpression="attribute_not_exists(halfwaySeq) OR halfwaySeq > :seq",
            ExpressionAttributeValues={":eta": msg["etaAt"], ":seq": msg["seq"]},
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def send_to_dlq(record: dict, reason: str) -> None:
    if not DLQ_URL:
        logger.error("No DLQ configured; dropping invalid record: %s", reason)
        return
    sqs.send_message(QueueUrl=DLQ_URL, MessageBody=json.dumps({
        "source":         "process_event.validation",
        "reason":         reason,
        "sequenceNumber": record.get("kinesis", {}).get("sequenceNumber"),
        "data":           record.get("kinesis", {}).get("data"),
    }))


def handler(event, context):
    records = event.get("Records", [])
    success = skipped = invalid = 0
    failures: list[dict] = []
    now = int(time.time())

    for record in records:
        seq = record.get("kinesis", {}).get("sequenceNumber")
        sid = "?"
        try:
            msg = parse_record(record)
            sid = msg["shipmentId"]
            write_events(msg, now)
            record_halfway_eta(msg)
            upsert_state(msg, now)
            success += 1
        except InvalidEvent as exc:
            logger.warning("Invalid record %s: %s", seq, exc)
            send_to_dlq(record, str(exc))
            invalid += 1
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                skipped += 1           # duplicate or out-of-order message
            else:
                logger.error("DynamoDB error for %s: %s", sid, exc, exc_info=True)
                failures.append({"itemIdentifier": seq})
        except Exception as exc:  # noqa: BLE001 — anything unexpected is retried
            logger.error("Failed to process record %s (%s): %s", seq, sid, exc, exc_info=True)
            failures.append({"itemIdentifier": seq})

    logger.info("Processed %d records — success=%d skipped=%d invalid=%d failed=%d",
                len(records), success, skipped, invalid, len(failures))
    return {"batchItemFailures": failures}
