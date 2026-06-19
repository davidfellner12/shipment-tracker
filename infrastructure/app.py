"""
AWS CDK Stack — Real-Time Shipment Tracker
TU Wien × AWS 2026 — David Fellner

Deploys:
  - DynamoDB table (ShipmentsTable, PAY_PER_REQUEST / on-demand)
  - Kinesis Data Stream (1 shard — see scaling notes below)
  - SQS Dead-Letter Queue for failed Kinesis events
  - AWS IoT Core rule (IoT → Kinesis) with DLQ error action
  - Lambda: process_event   — Kinesis consumer, idempotent upsert to DynamoDB
  - Lambda: get_shipments   — REST API backend (GET /shipments[/{id}])
  - Lambda: update_shipment — Demo delay toggle  (PUT /shipments/{id})
  - API Gateway REST API
  - IAM roles with least-privilege policies

Architecture trade-offs documented inline.
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
    aws_sqs as sqs,
)
from constructs import Construct


class ShipmentTrackerStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── 1. DynamoDB Table ─────────────────────────────────────────────
        # PAY_PER_REQUEST (on-demand): no capacity planning for unpredictable PoC
        # traffic; cheaper than provisioned for sporadic demo loads.
        # Production alternative: provisioned + auto-scaling at steady fleet rates.
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
            time_to_live_attribute="ttl",           # 24 h event retention
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            point_in_time_recovery=False,           # not needed for PoC
        )

        # ── 2. Kinesis Data Stream ────────────────────────────────────────
        # WHY Kinesis instead of direct IoT → Lambda via rules engine?
        #   • Replay: 24 h retention lets a redeployed Lambda re-process events
        #   • Ordering: records within a shard are strictly ordered by arrival
        #   • Fan-out: future consumers (analytics, alerts) can read same stream
        #   • Back-pressure: Kinesis buffers bursts; Lambda scales smoothly
        # Trade-off: Kinesis costs ~$0.015/shard/h; direct routing is free.
        # For PoC the cost difference is cents; at production scale the benefits
        # outweigh the shard cost.
        # Scaling: 1 shard handles ~1 MB/s / ~1000 records/s. Sufficient for
        # a 10-truck PoC publishing every 3 s. Add shards at ~10,000 trucks.
        stream = kinesis.Stream(
            self,
            "ShipmentStream",
            stream_name="shipment-location-stream",
            shard_count=1,
            retention_period=Duration.hours(24),
            encryption=kinesis.StreamEncryption.MANAGED,
        )

        # ── 3. Dead-Letter Queue (failure handling) ───────────────────────
        # Events that fail all Lambda retries land here for manual inspection.
        # 14-day retention gives ops time to diagnose and replay.
        dlq = sqs.Queue(
            self,
            "ProcessEventDLQ",
            queue_name="shipment-process-event-dlq",
            retention_period=Duration.days(14),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
        )

        # ── 4. Lambda — process_event (Kinesis consumer) ──────────────────
        # Idempotent: uses DynamoDB conditional write to reject duplicate/stale
        # GPS events (network retries, simulator restarts send the same timestamp).
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

        shipments_table.grant_write_data(process_fn)

        # bisect_batch_on_error: on failure, split batch in two and retry each
        # half — prevents one bad record from blocking the whole shard.
        # retry_attempts=3: after 3 retries the batch goes to the DLQ.
        process_fn.add_event_source(
            lambda_events.KinesisEventSource(
                stream,
                starting_position=lambda_.StartingPosition.LATEST,
                batch_size=10,
                bisect_batch_on_error=True,
                retry_attempts=3,
                on_failure=lambda_events.SqsDlq(dlq),
            )
        )

        # ── 5. Lambda — get_shipments (REST API backend) ──────────────────
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

        # ── 6. Lambda — update_shipment (demo delay toggle) ───────────────
        # Allows the demo to mark a shipment as delayed/recovered via REST PUT.
        # Least-privilege: only write to the single shipments table.
        update_fn = lambda_.Function(
            self,
            "UpdateShipmentFn",
            function_name="shipment-update-shipment",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.handler",
            code=lambda_.Code.from_asset("../lambda/update_shipment"),
            timeout=Duration.seconds(10),
            memory_size=128,
            environment={
                "SHIPMENTS_TABLE": shipments_table.table_name,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        shipments_table.grant_write_data(update_fn)

        # ── 7. API Gateway ────────────────────────────────────────────────
        # REST + polling every 2 s achieves the <5 s end-to-end latency target
        # (pipeline: ~1–2 s; poll overhead: 0–2 s; total: ≤4 s).
        # WebSocket alternative (API GW WebSocket or IoT Core MQTT-over-WS)
        # would push updates instantly but adds connection-management complexity
        # (connection table, route Lambda, Cognito for browser auth).
        # Trade-off accepted: REST polling satisfies PoC latency target.
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

        get_integration    = apigw.LambdaIntegration(get_fn)
        update_integration = apigw.LambdaIntegration(update_fn)

        shipments_resource = api.root.add_resource("shipments")
        shipments_resource.add_method("GET", get_integration, api_key_required=False)

        single_shipment = shipments_resource.add_resource("{id}")
        single_shipment.add_method("GET", get_integration,    api_key_required=False)
        single_shipment.add_method("PUT", update_integration, api_key_required=False)

        # ── 8. IoT Core Rule (IoT → Kinesis) ──────────────────────────────
        iot_kinesis_role = iam.Role(
            self,
            "IoTKinesisRole",
            assumed_by=iam.ServicePrincipal("iot.amazonaws.com"),
            description="Allows IoT Core to put records into Kinesis",
        )
        stream.grant_write(iot_kinesis_role)

        # Separate role for DLQ writes (least-privilege: IoT only needs SQS SendMessage)
        iot_dlq_role = iam.Role(
            self,
            "IoTDLQRole",
            assumed_by=iam.ServicePrincipal("iot.amazonaws.com"),
            description="Allows IoT Core rule error action to write to DLQ",
        )
        dlq.grant_send_messages(iot_dlq_role)

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
                # errorAction: if Kinesis put fails, route the message to the DLQ
                error_action=iot.CfnTopicRule.ActionProperty(
                    sqs=iot.CfnTopicRule.SqsActionProperty(
                        queue_url=dlq.queue_url,
                        role_arn=iot_dlq_role.role_arn,
                        use_base64=False,
                    )
                ),
                rule_disabled=False,
            ),
        )

        # ── Outputs ───────────────────────────────────────────────────────
        CfnOutput(self, "ApiUrl",             value=api.url,            description="REST API base URL")
        CfnOutput(self, "ShipmentsTableName", value=shipments_table.table_name)
        CfnOutput(self, "KinesisStreamName",  value=stream.stream_name)
        CfnOutput(self, "DLQUrl",             value=dlq.queue_url,      description="Dead-letter queue URL")
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
