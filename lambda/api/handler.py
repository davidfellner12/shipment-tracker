"""
Lambda: api — read side of the REST API (API Gateway proxy integration).

  GET /shipments                  live board: active + delivered in the last 24 h
      ?customerId=CUST-XXX        only that customer's shipments
      ?scope=history&days=30      delivered shipments in the window
  GET /shipments/{id}             one shipment + its milestone timeline
  GET /metrics?customerId=&days=  KPIs, daily series, lanes, customers, CO2, delay causes

Tenancy note: customerId is a filter, not an authorization boundary. Selling this
to shippers requires a Cognito authorizer that pins customerId to the caller's
token claim (see docs/AWS_SERVICES.md).
"""

import os
import json
import time
import logging
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from views import shipment_view, compute_metrics, clock, ts

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb     = boto3.resource("dynamodb")
table        = dynamodb.Table(os.environ["SHIPMENTS_TABLE"])
events_table = dynamodb.Table(os.environ["EVENTS_TABLE"])

ALLOWED_ORIGINS = [o for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o]
MAX_DAYS = 90


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns Decimals; convert them to int/float for JSON."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj == obj.to_integral_value() else float(obj)
        return super().default(obj)


def cors_headers(event: dict) -> dict:
    headers = event.get("headers") or {}
    origin  = headers.get("origin") or headers.get("Origin")
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
    return {"statusCode": status_code, "headers": cors_headers(event),
            "body": json.dumps(body, cls=DecimalEncoder, separators=(",", ":"))}


def scan_all() -> list[dict]:
    # A scan is fine for hundreds–low thousands of items (the table holds current
    # state + 90 days of delivered shipments). At larger scale: GSI on
    # (customerId, deliveredAt) and pre-aggregated daily metrics.
    result = table.scan()
    items = result.get("Items", [])
    while "LastEvaluatedKey" in result:
        result = table.scan(ExclusiveStartKey=result["LastEvaluatedKey"])
        items.extend(result.get("Items", []))
    return [i for i in items if "seq" in i]   # skip partial items with no telemetry yet


def int_param(params: dict, name: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(params.get(name, default))))
    except (TypeError, ValueError):
        return default


def list_shipments(params: dict) -> dict:
    items = scan_all()
    now_sim, now_real = clock(items), time.time()
    if params.get("customerId"):
        items = [i for i in items if i.get("customerId") == params["customerId"]]

    if params.get("scope") == "history":
        since = now_sim - int_param(params, "days", 30, 1, MAX_DAYS) * 86_400
        items = [i for i in items if i.get("status") == "DELIVERED" and (ts(i.get("deliveredAt")) or 0) >= since]
        items.sort(key=lambda i: i.get("deliveredAt") or "", reverse=True)
    else:
        items = [i for i in items if i.get("status") != "DELIVERED"
                 or (ts(i.get("deliveredAt")) or 0) >= now_sim - 86_400]
        items.sort(key=lambda i: i.get("shipmentId", ""))

    views = [shipment_view(i, now_real) for i in items]
    return {"shipments": views, "count": len(views), "simTime": items and max(i.get("simTime", "") for i in items) or None}


def get_shipment(shipment_id: str) -> dict | None:
    item = table.get_item(Key={"shipmentId": shipment_id}).get("Item")
    if not item:
        return None
    events = events_table.query(KeyConditionExpression=Key("shipmentId").eq(shipment_id))["Items"]
    for e in events:
        e.pop("ttl", None)
    return {"shipment": shipment_view(item, time.time()), "events": events}


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return respond(event, 200, {})

    resource = event.get("resource") or event.get("path") or ""
    params   = event.get("queryStringParameters") or {}
    path_id  = (event.get("pathParameters") or {}).get("id")

    try:
        if resource.startswith("/metrics"):
            days = int_param(params, "days", 30, 1, MAX_DAYS)
            return respond(event, 200, compute_metrics(scan_all(), days, params.get("customerId")))
        if path_id:
            result = get_shipment(path_id)
            if not result:
                return respond(event, 404, {"error": f"Shipment {path_id} not found"})
            return respond(event, 200, result)
        return respond(event, 200, list_shipments(params))
    except Exception as exc:  # noqa: BLE001
        logger.error("API error: %s", exc, exc_info=True)
        return respond(event, 500, {"error": "Internal server error"})
