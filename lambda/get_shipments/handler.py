"""
Lambda: get_shipments
Triggered by API Gateway GET /shipments (and GET /shipments/{id}).
Returns current shipment state from DynamoDB.
"""

import os
import json
import logging
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["SHIPMENTS_TABLE"]
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
}


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns Decimals; convert them to float for JSON."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def get_all_shipments() -> list[dict]:
    result = table.scan()
    items = result.get("Items", [])
    # Handle pagination
    while "LastEvaluatedKey" in result:
        result = table.scan(ExclusiveStartKey=result["LastEvaluatedKey"])
        items.extend(result.get("Items", []))
    return items


def get_shipment_by_id(shipment_id: str) -> dict | None:
    result = table.get_item(Key={"shipmentId": shipment_id})
    return result.get("Item")


def handler(event, context):
    http_method = event.get("httpMethod", "GET")
    path_params = event.get("pathParameters") or {}

    # Handle CORS preflight
    if http_method == "OPTIONS":
        return respond(200, {})

    shipment_id = path_params.get("id")

    try:
        if shipment_id:
            item = get_shipment_by_id(shipment_id)
            if not item:
                return respond(404, {"error": f"Shipment {shipment_id} not found"})
            return respond(200, {"shipment": item})
        else:
            items = get_all_shipments()
            # Sort by shipmentId for stable ordering
            items.sort(key=lambda x: x.get("shipmentId", ""))
            return respond(200, {"shipments": items, "count": len(items)})

    except Exception as exc:
        logger.error(f"Error fetching shipments: {exc}", exc_info=True)
        return respond(500, {"error": "Internal server error"})
