"""
Lambda: update_shipment
Handles PUT /shipments/{id}.

Used during the live demo to mark a shipment as delayed or recover it,
demonstrating the dashboard's real-time reaction within seconds.

Only delay-related fields may be updated — the live GPS pipeline owns all
positional/telemetry state. Cascades isDelayed → status automatically.
"""

import os
import json
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["SHIPMENTS_TABLE"]
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Content-Type":                 "application/json",
}

ALLOWED_FIELDS = {"isDelayed", "delayReason", "status"}


def respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers":    CORS_HEADERS,
        "body":       json.dumps(body),
    }


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return respond(200, {})

    path_params = event.get("pathParameters") or {}
    shipment_id = path_params.get("id")

    if not shipment_id:
        return respond(400, {"error": "shipmentId required in path"})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return respond(400, {"error": "Invalid JSON body"})

    updates = {k: v for k, v in body.items() if k in ALLOWED_FIELDS}
    if not updates:
        return respond(400, {"error": f"No valid update fields. Allowed: {', '.join(sorted(ALLOWED_FIELDS))}"})

    try:
        if not table.get_item(Key={"shipmentId": shipment_id}).get("Item"):
            return respond(404, {"error": f"Shipment {shipment_id} not found"})

        expr_parts = ["#updatedAt = :updatedAt"]
        names  = {"#updatedAt": "updatedAt"}
        values = {":updatedAt": datetime.now(timezone.utc).isoformat()}

        for i, (k, v) in enumerate(updates.items()):
            names[f"#f{i}"]  = k
            values[f":v{i}"] = v
            expr_parts.append(f"#f{i} = :v{i}")

            # Cascade: toggling isDelayed also updates the status field
            if k == "isDelayed":
                names["#status"]  = "status"
                values[":status"] = "DELAYED" if v else "IN_TRANSIT"
                expr_parts.append("#status = :status")

        table.update_item(
            Key={"shipmentId": shipment_id},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
        logger.info(f"Updated {shipment_id}: {updates}")
        return respond(200, {"updated": shipment_id, "fields": updates})

    except ClientError as exc:
        logger.error(f"DynamoDB error: {exc}", exc_info=True)
        return respond(500, {"error": "Internal server error"})
