"""
Lambda: process_event
Triggered by Kinesis Data Stream.

Decodes each GPS event record and upserts shipment state into DynamoDB.

Idempotency: uses a DynamoDB conditional write — only updates the item if the
incoming timestamp is strictly newer than the stored one (or the item does not
exist yet). This prevents duplicated GPS events (MQTT QoS AT_LEAST_ONCE,
network retries, simulator restarts) from overwriting fresher state.

ETA calculation: simple distance/speed division using per-route total km and
the current speed reported by the simulator. Not route-aware (no traffic or
road-network data); sufficient for PoC. Production would integrate AWS
Location Service or a routing API.
"""

import os
import json
import base64
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["SHIPMENTS_TABLE"]
table = dynamodb.Table(TABLE_NAME)

AT_RISK_ETA_THRESHOLD = 30  # minutes


def compute_status_label(event: dict) -> str:
    """Derive a human-friendly status from the raw GPS event."""
    if event.get("status") == "DELIVERED":
        return "DELIVERED"
    if event.get("isDelayed"):
        return "DELAYED"
    if event.get("etaMinutes", 999) <= AT_RISK_ETA_THRESHOLD:
        return "ARRIVING_SOON"
    return "IN_TRANSIT"


def handler(event, context):
    records = event.get("Records", [])
    logger.info(f"Processing {len(records)} Kinesis record(s)")

    success = 0
    skipped = 0
    errors  = 0

    for record in records:
        shipment_id = "?"
        try:
            raw = base64.b64decode(record["kinesis"]["data"]).decode("utf-8")
            payload: dict = json.loads(raw)

            shipment_id  = payload["shipmentId"]
            status_label = compute_status_label(payload)
            new_ts       = payload["timestamp"]

            item = {
                "shipmentId":  shipment_id,
                "timestamp":   new_ts,
                "latitude":    str(payload["latitude"]),
                "longitude":   str(payload["longitude"]),
                "status":      status_label,
                "nearestCity": payload.get("nearestCity", "Unknown"),
                "cargo":       payload.get("cargo", "Unknown"),
                "routeLabel":  payload.get("routeLabel", ""),
                "speedKmh":    str(payload.get("speedKmh", 0)),
                "etaMinutes":  payload.get("etaMinutes", 0),
                "progress":    str(payload.get("progress", 0)),
                "isDelayed":   payload.get("isDelayed", False),
                "updatedAt":   datetime.now(timezone.utc).isoformat(),
                # TTL: keep records for 24 hours (epoch seconds)
                "ttl":         int(datetime.now(timezone.utc).timestamp()) + 86_400,
            }

            # Idempotent write: reject the event if a newer record is already stored.
            # ConditionalCheckFailedException = duplicate or out-of-order event; safe to skip.
            table.put_item(
                Item=item,
                ConditionExpression=(
                    "attribute_not_exists(shipmentId) OR #ts < :new_ts"
                ),
                ExpressionAttributeNames={"#ts": "timestamp"},
                ExpressionAttributeValues={":new_ts": new_ts},
            )
            logger.info(f"Upserted {shipment_id} → {status_label} ({item['nearestCity']})")
            success += 1

        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                logger.info(f"Skipped duplicate/stale event for {shipment_id}")
                skipped += 1
            else:
                logger.error(f"DynamoDB error for {shipment_id}: {exc}", exc_info=True)
                errors += 1
        except Exception as exc:
            logger.error(f"Failed to process record ({shipment_id}): {exc}", exc_info=True)
            errors += 1

    logger.info(f"Done — success={success}, skipped={skipped}, errors={errors}")
    return {"success": success, "skipped": skipped, "errors": errors}
