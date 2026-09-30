import os
import sys
import importlib.util
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

ROOT = Path(__file__).resolve().parent.parent
for sub in ("infrastructure", "simulator", "lambda/api"):
    sys.path.insert(0, str(ROOT / sub))

os.environ.setdefault("AWS_DEFAULT_REGION", "eu-central-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")


def load_handler(name: str):
    """Each Lambda lives in its own folder as handler.py — load it by path."""
    spec = importlib.util.spec_from_file_location(f"{name}_handler", ROOT / "lambda" / name / "handler.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def aws(monkeypatch):
    with mock_aws():
        ddb = boto3.resource("dynamodb")
        table = ddb.create_table(
            TableName="Shipments-test",
            KeySchema=[{"AttributeName": "shipmentId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "shipmentId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        events = ddb.create_table(
            TableName="Events-test",
            KeySchema=[{"AttributeName": "shipmentId", "KeyType": "HASH"},
                       {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "shipmentId", "AttributeType": "S"},
                                  {"AttributeName": "sk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        queue_url = boto3.client("sqs").create_queue(QueueName="dlq")["QueueUrl"]
        monkeypatch.setenv("SHIPMENTS_TABLE", "Shipments-test")
        monkeypatch.setenv("EVENTS_TABLE", "Events-test")
        monkeypatch.setenv("DLQ_URL", queue_url)
        monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000,https://example.cloudfront.net")
        yield {"table": table, "events": events, "queue_url": queue_url}
