"""
Lambda: process_event
Triggered by Kinesis Data Stream.
Decodes each GPS event record and upserts shipment state into DynamoDB.
"""

import os
import json
import base64
import logging
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["SHIPMENTS_TABLE"]
table = dynamodb.Table(TABLE_NAME)

# How many minutes late makes a shipment "at risk"
AT_RISK_ETA_THRESHOLD = 30


def compute_status_label(event: dict) -> str:
    """Derive a human-friendly status from the raw event."""
    if event.get("status") == "DELIVERED":
        return "DELIVERED"
    if event.get("isDelayed"):
        return "DELAYED"
    eta = event.get("etaMinutes", 999)
    if eta <= AT_RISK_ETA_THRESHOLD:
        return "ARRIVING_SOON"
    return "IN_TRANSIT"


def handler(event, context):
    records = event.get("Records", [])
    logger.info(f"Processing {len(records)} Kinesis record(s)")

    success = 0
    errors = 0

    for record in records:
        try:
            # Kinesis data is base64-encoded
            raw = base64.b64decode(record["kinesis"]["data"]).decode("utf-8")
            payload: dict = json.loads(raw)

            shipment_id = payload["shipmentId"]
            status_label = compute_status_label(payload)

            item = {
                "shipmentId": shipment_id,
                "timestamp": payload["timestamp"],
                "latitude": str(payload["latitude"]),   # DynamoDB stores as string to avoid float issues
                "longitude": str(payload["longitude"]),
                "status": status_label,
                "nearestCity": payload.get("nearestCity", "Unknown"),
                "cargo": payload.get("cargo", "Unknown"),
                "routeLabel": payload.get("routeLabel", ""),
                "speedKmh": str(payload.get("speedKmh", 0)),
                "etaMinutes": payload.get("etaMinutes", 0),
                "progress": str(payload.get("progress", 0)),
                "isDelayed": payload.get("isDelayed", False),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                # TTL: keep records for 24 hours (epoch seconds)
                "ttl": int(datetime.now(timezone.utc).timestamp()) + 86400,
            }

            table.put_item(Item=item)
            logger.info(f"Upserted {shipment_id} → {status_label} near {item['nearestCity']}")
            success += 1

        except Exception as exc:
            logger.error(f"Failed to process record: {exc}", exc_info=True)
            errors += 1

    logger.info(f"Done — success={success}, errors={errors}")
    return {"success": success, "errors": errors}
