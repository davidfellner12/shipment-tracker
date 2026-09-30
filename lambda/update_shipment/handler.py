"""
Lambda: update_shipment
Handles PUT /shipments/{id}. Requires an API key (enforced by API Gateway).

Lets an operator flag a shipment as delayed (or clear the flag), demonstrating
the dashboard's real-time reaction within seconds.

Ownership split:
  - The GPS pipeline (process_event) owns telemetry: position, speed, ETA,
    and the sensor-derived status.
  - This endpoint owns the operator override: manualDelay + delayReason.
get_shipments merges both when reading, so the override is not lost when the
next GPS event arrives.

Request body:  {"isDelayed": true, "delayReason": "Border control"}
"""

import os
import json
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["SHIPMENTS_TABLE"]
table = dynamodb.Table(TABLE_NAME)

ALLOWED_ORIGINS   = [o for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o]
MAX_REASON_LENGTH = 200


def cors_headers(event: dict) -> dict:
    origin = (event.get("headers") or {}).get("origin") or (event.get("headers") or {}).get("Origin")
    if "*" in ALLOWED_ORIGINS:
        allow = "*"
    elif origin in ALLOWED_ORIGINS:
        allow = origin
    else:
        allow = ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else ""
    return {
        "Access-Control-Allow-Origin":  allow,
        "Access-Control-Allow-Headers": "Content-Type,X-Api-Key",
        "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
        "Vary":                         "Origin",
        "Cache-Control":                "no-store",
        "Content-Type":                 "application/json",
    }


def respond(event: dict, status_code: int, body: dict) -> dict:
    return {"statusCode": status_code, "headers": cors_headers(event), "body": json.dumps(body)}


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return respond(event, 200, {})

    shipment_id = (event.get("pathParameters") or {}).get("id")
    if not shipment_id:
        return respond(event, 400, {"error": "shipmentId required in path"})

    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        return respond(event, 400, {"error": "Invalid JSON body"})
    if not isinstance(body, dict):
        return respond(event, 400, {"error": "Body must be a JSON object"})

    is_delayed = body.get("isDelayed")
    if not isinstance(is_delayed, bool):
        return respond(event, 400, {"error": "'isDelayed' (boolean) is required"})

    reason = body.get("delayReason") or ""
    if not isinstance(reason, str) or len(reason) > MAX_REASON_LENGTH:
        return respond(event, 400, {"error": f"'delayReason' must be a string ≤ {MAX_REASON_LENGTH} chars"})

    names  = {"#md": "manualDelay", "#u": "updatedBy", "#ua": "manualUpdatedAt"}
    values = {
        ":md": is_delayed,
        ":u":  (event.get("requestContext") or {}).get("identity", {}).get("apiKeyId") or "unknown",
        ":ua": datetime.now(timezone.utc).isoformat(),
    }
    expr = "SET #md = :md, #u = :u, #ua = :ua"
    if is_delayed:
        names["#dr"]  = "delayReason"
        values[":dr"] = reason or "Manually flagged by operator"
        expr += ", #dr = :dr"
    else:
        names["#dr"] = "delayReason"
        expr += " REMOVE #dr"

    try:
        table.update_item(
            Key={"shipmentId": shipment_id},
            UpdateExpression=expr,
            ConditionExpression="attribute_exists(shipmentId)",
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(event, 404, {"error": f"Shipment {shipment_id} not found"})
        logger.error("DynamoDB error: %s", exc, exc_info=True)
        return respond(event, 500, {"error": "Internal server error"})

    logger.info("Updated %s: manualDelay=%s reason=%r", shipment_id, is_delayed, reason)
    return respond(event, 200, {"updated": shipment_id, "isDelayed": is_delayed})
