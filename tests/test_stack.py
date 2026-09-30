"""Infrastructure assertions: security and reliability settings must not regress."""

import aws_cdk as cdk
from aws_cdk.assertions import Template, Match

from stack import ShipmentTrackerStack


def synth(**kwargs) -> Template:
    app = cdk.App()
    stack = ShipmentTrackerStack(app, "Test", deploy_frontend=False, **kwargs)
    return Template.from_stack(stack)


def test_write_endpoint_requires_api_key():
    t = synth()
    t.has_resource_properties("AWS::ApiGateway::Method", {"HttpMethod": "PUT", "ApiKeyRequired": True})
    t.has_resource_properties("AWS::ApiGateway::Method", {"HttpMethod": "GET", "ApiKeyRequired": Match.absent()})


def test_data_encrypted_at_rest():
    t = synth()
    t.has_resource_properties("AWS::DynamoDB::Table", {"SSESpecification": {"SSEEnabled": True}})
    t.has_resource_properties("AWS::Kinesis::Stream", {"StreamEncryption": Match.object_like({"EncryptionType": "KMS"})})
    t.has_resource_properties("AWS::SQS::Queue", {"SqsManagedSseEnabled": True})


def test_kinesis_consumer_has_partial_batch_and_dlq():
    synth().has_resource_properties("AWS::Lambda::EventSourceMapping", {
        "FunctionResponseTypes": ["ReportBatchItemFailures"],
        "BisectBatchOnFunctionError": True,
        "DestinationConfig": {"OnFailure": Match.any_value()},
    })


def test_iot_policy_is_least_privilege():
    (policy,) = synth().find_resources("AWS::IoT::Policy").values()
    actions = {s["Action"] for s in policy["Properties"]["PolicyDocument"]["Statement"]}
    assert actions == {"iot:Connect", "iot:Publish"}


def test_prod_retains_data_and_enables_pitr():
    t = synth(stage="prod")
    t.has_resource("AWS::DynamoDB::Table", {"DeletionPolicy": "Retain"})
    t.has_resource_properties("AWS::DynamoDB::Table", {
        "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True},
    })


def test_budget_and_alarms_only_with_email():
    assert synth().find_resources("AWS::Budgets::Budget") == {}
    t = synth(alert_email="ops@example.com")
    t.resource_count_is("AWS::Budgets::Budget", 1)
    t.resource_count_is("AWS::CloudWatch::Alarm", 4)
    t.resource_count_is("AWS::DynamoDB::Table", 2)
