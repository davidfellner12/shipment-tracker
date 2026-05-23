"""
AWS CDK Stack — Real-Time Shipment Tracker
TU Wien × AWS 2026 — David Fellner

Deploys:
  - DynamoDB table (ShipmentsTable)
  - Kinesis Data Stream
  - AWS IoT Core rule (IoT → Kinesis)
  - Lambda: process_event (Kinesis consumer)
  - Lambda: get_shipments (API Gateway backend)
  - API Gateway REST API
  - IAM roles with least-privilege policies
"""

import aws_cdk as cdk
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_dynamodb as dynamodb,
    aws_kinesis as kinesis,
    aws_lambda as lambda_,
    aws_lambda_event_sources as lambda_events,
    aws_iot as iot,
    aws_apigateway as apigw,
    aws_iam as iam,
    aws_logs as logs,
)
from constructs import Construct


class ShipmentTrackerStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── 1. DynamoDB Table ─────────────────────────────────────────────
        shipments_table = dynamodb.Table(
            self,
            "ShipmentsTable",
            table_name="ShipmentsTable",
            partition_key=dynamodb.Attribute(
                name="shipmentId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,  # easy teardown for PoC
            time_to_live_attribute="ttl",
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            point_in_time_recovery=False,  # not needed for PoC
        )

        # ── 2. Kinesis Data Stream ────────────────────────────────────────
        stream = kinesis.Stream(
            self,
            "ShipmentStream",
            stream_name="shipment-location-stream",
            shard_count=1,  # 1 shard = ~1 MB/s, sufficient for PoC
            retention_period=Duration.hours(24),
            encryption=kinesis.StreamEncryption.MANAGED,
        )

        # ── 3. Lambda — process_event (Kinesis consumer) ──────────────────
        process_fn = lambda_.Function(
            self,
            "ProcessEventFn",
            function_name="shipment-process-event",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.handler",
            code=lambda_.Code.from_asset("../lambda/process_event"),
            timeout=Duration.seconds(30),
            memory_size=256,
            environment={
                "SHIPMENTS_TABLE": shipments_table.table_name,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # Grant Lambda write access to DynamoDB
        shipments_table.grant_write_data(process_fn)

        # Attach Kinesis trigger
        process_fn.add_event_source(
            lambda_events.KinesisEventSource(
                stream,
                starting_position=lambda_.StartingPosition.LATEST,
                batch_size=10,
                bisect_batch_on_error=True,
                retry_attempts=3,
            )
        )

        # ── 4. Lambda — get_shipments (REST API backend) ──────────────────
        get_fn = lambda_.Function(
            self,
            "GetShipmentsFn",
            function_name="shipment-get-shipments",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.handler",
            code=lambda_.Code.from_asset("../lambda/get_shipments"),
            timeout=Duration.seconds(10),
            memory_size=128,
            environment={
                "SHIPMENTS_TABLE": shipments_table.table_name,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        shipments_table.grant_read_data(get_fn)

        # ── 5. API Gateway ────────────────────────────────────────────────
        api = apigw.RestApi(
            self,
            "ShipmentApi",
            rest_api_name="shipment-tracker-api",
            description="Real-Time Shipment Tracker API",
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
            ),
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                throttling_rate_limit=100,
                throttling_burst_limit=200,
            ),
        )

        integration = apigw.LambdaIntegration(get_fn)
        shipments_resource = api.root.add_resource("shipments")
        shipments_resource.add_method("GET", integration, api_key_required=False)

        single_shipment = shipments_resource.add_resource("{id}")
        single_shipment.add_method("GET", integration, api_key_required=False)

        # ── 6. IoT Core Rule (IoT → Kinesis) ──────────────────────────────
        iot_kinesis_role = iam.Role(
            self,
            "IoTKinesisRole",
            assumed_by=iam.ServicePrincipal("iot.amazonaws.com"),
            description="Allows IoT Core to put records into Kinesis",
        )
        stream.grant_write(iot_kinesis_role)

        iot.CfnTopicRule(
            self,
            "ShipmentLocationRule",
            rule_name="shipment_location_to_kinesis",
            topic_rule_payload=iot.CfnTopicRule.TopicRulePayloadProperty(
                sql="SELECT * FROM 'shipments/+/location'",
                aws_iot_sql_version="2016-03-23",
                actions=[
                    iot.CfnTopicRule.ActionProperty(
                        kinesis=iot.CfnTopicRule.KinesisActionProperty(
                            role_arn=iot_kinesis_role.role_arn,
                            stream_name=stream.stream_name,
                            partition_key="${shipmentId}",
                        )
                    )
                ],
                rule_disabled=False,
            ),
        )

        # ── 7. IoT Thing & Certificate (for simulator) ───────────────────
        # Note: Certificate must be created manually in console and paths
        # updated in simulator/config.py. See README for instructions.

        # ── Outputs ───────────────────────────────────────────────────────
        CfnOutput(self, "ApiUrl", value=api.url, description="REST API base URL")
        CfnOutput(self, "ShipmentsTableName", value=shipments_table.table_name)
        CfnOutput(self, "KinesisStreamName", value=stream.stream_name)
        CfnOutput(
            self,
            "IoTEndpointHint",
            value="Run: aws iot describe-endpoint --endpoint-type iot:Data-ATS",
            description="Fetch your IoT endpoint with this CLI command",
        )


# ── App entry point ───────────────────────────────────────────────────────────
app = cdk.App()
ShipmentTrackerStack(
    app,
    "ShipmentTrackerStack",
    env=cdk.Environment(
        account=app.node.try_get_context("account"),
        region=app.node.try_get_context("region") or "eu-central-1",
    ),
    description="TU Wien × AWS 2026 — Real-Time Shipment Tracker PoC",
)
app.synth()
