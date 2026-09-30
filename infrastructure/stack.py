"""
AWS CDK Stack — Real-Time Shipment Tracker
TU Wien × AWS 2026 — David Fellner

Deploys:
  - DynamoDB tables: Shipments (current state + 90 d delivered), ShipmentEvents (milestone history)
  - Kinesis Data Stream (1 shard — see scaling notes below)
  - SQS Dead-Letter Queue for failed / invalid events
  - AWS IoT Core: device policy (least privilege) + rule (IoT → Kinesis) with DLQ error action
  - Lambda: process_event   — Kinesis consumer, idempotent upsert to DynamoDB
  - Lambda: api             — read API (GET /shipments[/{id}], GET /metrics)
  - Lambda: update_shipment — operator delay override (PUT /shipments/{id}, API key)
  - API Gateway REST API + usage plan / API key for write access
  - S3 + CloudFront hosting for the React dashboard (if dashboard/dist exists)
  - Observability: CloudWatch alarms → SNS email, CloudWatch dashboard, X-Ray
  - Cost guardrail: AWS Budget with 50 % / 80 % / 100 % email alerts

Context (cdk.json or `cdk deploy -c key=value`):
  stage          "dev" (default) or "prod" — prod retains data + enables PITR
  alertEmail     email for alarms and budget alerts (optional but recommended)
  monthlyBudget  USD, default 10
  allowedOrigins comma-separated extra CORS origins (default http://localhost:3000)
"""

from pathlib import Path

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
    aws_sns as sns,
    aws_sns_subscriptions as subs,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_budgets as budgets,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
)
from constructs import Construct

ROOT          = Path(__file__).resolve().parent.parent
LAMBDA_DIR    = ROOT / "lambda"
DASHBOARD_DIST = ROOT / "dashboard" / "dist"

IOT_TOPIC_PREFIX = "shipments"
IOT_CLIENT_PREFIX = "shipment-simulator"


class ShipmentTrackerStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *,
                 stage: str = "dev",
                 alert_email: str | None = None,
                 monthly_budget_usd: float = 10,
                 extra_origins: list[str] | None = None,
                 deploy_frontend: bool | None = None,
                 **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        is_prod = stage == "prod"
        removal = RemovalPolicy.RETAIN if is_prod else RemovalPolicy.DESTROY
        if deploy_frontend is None:
            deploy_frontend = (DASHBOARD_DIST / "index.html").exists()

        # ── 1. DynamoDB Table ─────────────────────────────────────────────
        # PAY_PER_REQUEST (on-demand): no capacity planning for unpredictable
        # traffic; cheaper than provisioned for sporadic demo loads.
        # At steady fleet rates, provisioned + auto-scaling becomes cheaper.
        shipments_table = dynamodb.Table(
            self, "ShipmentsTable",
            table_name=f"ShipmentsTable-{stage}",
            partition_key=dynamodb.Attribute(name="shipmentId", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            time_to_live_attribute="ttl",
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=is_prod,
            ),
        )

        # Milestone history (departed, border, customs, breaks, temp excursions, …)
        # PK = shipmentId, SK = "<time>#<seq>#<n>" → one Query returns the timeline in order.
        events_table = dynamodb.Table(
            self, "ShipmentEventsTable",
            table_name=f"ShipmentEvents-{stage}",
            partition_key=dynamodb.Attribute(name="shipmentId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            time_to_live_attribute="ttl",
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=is_prod,
            ),
        )

        # ── 2. Kinesis Data Stream ────────────────────────────────────────
        # WHY Kinesis instead of IoT → Lambda directly?
        #   • Replay: 24 h retention lets a redeployed Lambda re-process events
        #   • Ordering: records within a shard are ordered (partition = shipmentId)
        #   • Fan-out: future consumers (analytics, alerts) can read the same stream
        #   • Back-pressure: Kinesis buffers bursts; Lambda consumes at its own pace
        # Trade-off: a provisioned shard costs ~$0.015/h (~$11/month) even idle —
        # this is the largest line item. Destroy the stack after the demo.
        # Scaling: 1 shard = 1 MB/s or 1000 records/s in → ~3000 trucks at 1 msg/3 s.
        stream = kinesis.Stream(
            self, "ShipmentStream",
            stream_name=f"shipment-location-stream-{stage}",
            shard_count=1,
            retention_period=Duration.hours(24),
            encryption=kinesis.StreamEncryption.MANAGED,
        )
        stream.apply_removal_policy(removal)

        # ── 3. Dead-Letter Queue ──────────────────────────────────────────
        # Receives: (a) IoT rule errors (Kinesis put failed), (b) invalid
        # payloads rejected by process_event, (c) Kinesis batch metadata after
        # Lambda retries are exhausted. 14 days to diagnose and replay.
        dlq = sqs.Queue(
            self, "ProcessEventDLQ",
            queue_name=f"shipment-process-event-dlq-{stage}",
            retention_period=Duration.days(14),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            enforce_ssl=True,
        )

        # ── 4. Frontend hosting (S3 + CloudFront) ─────────────────────────
        # Private bucket, served only via CloudFront Origin Access Control.
        # Created before the API so its URL can be put on the CORS allow-list.
        allowed_origins = list(extra_origins or ["http://localhost:3000"])
        distribution = None
        site_bucket = None
        if deploy_frontend:
            site_bucket = s3.Bucket(
                self, "DashboardBucket",
                block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
                encryption=s3.BucketEncryption.S3_MANAGED,
                enforce_ssl=True,
                removal_policy=removal,
                auto_delete_objects=not is_prod,
            )
            distribution = cloudfront.Distribution(
                self, "DashboardCdn",
                comment=f"Shipment Tracker dashboard ({stage})",
                default_root_object="index.html",
                default_behavior=cloudfront.BehaviorOptions(
                    origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket),
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    response_headers_policy=cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                ),
                # SPA: unknown paths fall back to index.html
                error_responses=[
                    cloudfront.ErrorResponse(http_status=403, response_http_status=200,
                                             response_page_path="/index.html", ttl=Duration.seconds(0)),
                    cloudfront.ErrorResponse(http_status=404, response_http_status=200,
                                             response_page_path="/index.html", ttl=Duration.seconds(0)),
                ],
                price_class=cloudfront.PriceClass.PRICE_CLASS_100,  # EU + NA edges only
                minimum_protocol_version=cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            )
            allowed_origins.append(f"https://{distribution.distribution_domain_name}")

        # ── 5. Lambdas ────────────────────────────────────────────────────
        common_env = {
            "SHIPMENTS_TABLE": shipments_table.table_name,
            "EVENTS_TABLE":    events_table.table_name,
            "ALLOWED_ORIGINS": ",".join(allowed_origins),
            "LOG_LEVEL":       "INFO",
        }

        def make_fn(name: str, folder: str, memory: int, timeout_s: int, env: dict | None = None):
            log_group = logs.LogGroup(
                self, f"{name}Logs",
                log_group_name=f"/aws/lambda/shipment-{folder.replace('_', '-')}-{stage}",
                retention=logs.RetentionDays.TWO_WEEKS,
                removal_policy=RemovalPolicy.DESTROY,
            )
            return lambda_.Function(
                self, name,
                function_name=f"shipment-{folder.replace('_', '-')}-{stage}",
                runtime=lambda_.Runtime.PYTHON_3_12,
                architecture=lambda_.Architecture.ARM_64,   # Graviton: ~20 % cheaper
                handler="handler.handler",
                code=lambda_.Code.from_asset(str(LAMBDA_DIR / folder)),
                timeout=Duration.seconds(timeout_s),
                memory_size=memory,
                environment={**common_env, **(env or {})},
                log_group=log_group,
                logging_format=lambda_.LoggingFormat.JSON,
                tracing=lambda_.Tracing.ACTIVE,
            )

        # process_event: Kinesis consumer
        process_fn = make_fn("ProcessEventFn", "process_event", 256, 30, {"DLQ_URL": dlq.queue_url})
        shipments_table.grant(process_fn, "dynamodb:UpdateItem")
        events_table.grant(process_fn, "dynamodb:PutItem", "dynamodb:BatchWriteItem")
        dlq.grant_send_messages(process_fn)

        # bisect_batch_on_error: split a failing batch in two to isolate bad records.
        # report_batch_item_failures: handler returns failed sequence numbers so
        #   only those (and later) records are retried, not the whole batch.
        # max_record_age: don't retry events older than 1 h — stale GPS is useless.
        process_fn.add_event_source(
            lambda_events.KinesisEventSource(
                stream,
                starting_position=lambda_.StartingPosition.LATEST,
                batch_size=100,
                max_batching_window=Duration.seconds(1),
                bisect_batch_on_error=True,
                report_batch_item_failures=True,
                retry_attempts=3,
                max_record_age=Duration.hours(1),
                on_failure=lambda_events.SqsDlq(dlq),
            )
        )

        # 512 MB: /metrics scans and aggregates up to a few thousand items
        get_fn = make_fn("ApiFn", "api", 512, 15)
        shipments_table.grant(get_fn, "dynamodb:GetItem", "dynamodb:Scan")
        events_table.grant(get_fn, "dynamodb:Query")

        update_fn = make_fn("UpdateShipmentFn", "update_shipment", 128, 10)
        shipments_table.grant(update_fn, "dynamodb:UpdateItem")

        # ── 6. API Gateway ────────────────────────────────────────────────
        # REST + 2 s polling meets the <5 s end-to-end target
        # (pipeline ~1–2 s + poll 0–2 s). WebSockets would push instantly but
        # need a connection table + route Lambdas; not worth it at this latency target.
        #
        # Auth model: reads are public (it is a tracking page), writes require
        # an API key tied to a usage plan (throttled + quota). For real
        # multi-user production swap the API key for a Cognito authorizer.
        access_logs = logs.LogGroup(
            self, "ApiAccessLogs",
            retention=logs.RetentionDays.TWO_WEEKS,
            removal_policy=RemovalPolicy.DESTROY,
        )
        api = apigw.RestApi(
            self, "ShipmentApi",
            rest_api_name=f"shipment-tracker-api-{stage}",
            description="Real-Time Shipment Tracker API",
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=allowed_origins,
                allow_methods=["GET", "PUT", "OPTIONS"],
                allow_headers=["Content-Type", "X-Api-Key"],
                max_age=Duration.hours(1),
            ),
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                throttling_rate_limit=50,
                throttling_burst_limit=100,
                tracing_enabled=True,
                metrics_enabled=True,
                access_log_destination=apigw.LogGroupLogDestination(access_logs),
                access_log_format=apigw.AccessLogFormat.json_with_standard_fields(
                    caller=False, http_method=True, ip=True, protocol=True,
                    request_time=True, resource_path=True, response_length=True,
                    status=True, user=False,
                ),
            ),
            cloud_watch_role=True,
        )

        # Errors produced by API Gateway itself (missing API key → 403, throttling
        # → 429, validation → 400) never reach the Lambda, so add CORS headers
        # here — otherwise the browser hides the status behind a CORS error.
        for rtype in (apigw.ResponseType.DEFAULT_4_XX, apigw.ResponseType.DEFAULT_5_XX):
            api.add_gateway_response(
                f"Cors{rtype.response_type}",
                type=rtype,
                response_headers={
                    "Access-Control-Allow-Origin":  "'*'",
                    "Access-Control-Allow-Headers": "'Content-Type,X-Api-Key'",
                },
            )

        body_validator = api.add_request_validator(
            "BodyValidator", validate_request_body=True, validate_request_parameters=False,
        )
        update_model = api.add_model(
            "UpdateShipmentModel",
            content_type="application/json",
            schema=apigw.JsonSchema(
                schema=apigw.JsonSchemaVersion.DRAFT4,
                type=apigw.JsonSchemaType.OBJECT,
                required=["isDelayed"],
                properties={
                    "isDelayed":   apigw.JsonSchema(type=apigw.JsonSchemaType.BOOLEAN),
                    "delayReason": apigw.JsonSchema(type=apigw.JsonSchemaType.STRING, max_length=200),
                },
                additional_properties=False,
            ),
        )

        get_integration    = apigw.LambdaIntegration(get_fn)
        update_integration = apigw.LambdaIntegration(update_fn)

        shipments_resource = api.root.add_resource("shipments")
        shipments_resource.add_method("GET", get_integration)
        api.root.add_resource("metrics").add_method("GET", get_integration)
        single_shipment = shipments_resource.add_resource("{id}")
        single_shipment.add_method("GET", get_integration)
        single_shipment.add_method(
            "PUT", update_integration,
            api_key_required=True,
            request_validator=body_validator,
            request_models={"application/json": update_model},
        )

        operator_key = api.add_api_key("OperatorKey", api_key_name=f"shipment-operator-{stage}")
        plan = api.add_usage_plan(
            "OperatorPlan",
            name=f"shipment-operator-plan-{stage}",
            throttle=apigw.ThrottleSettings(rate_limit=5, burst_limit=10),
            quota=apigw.QuotaSettings(limit=10_000, period=apigw.Period.DAY),
        )
        plan.add_api_key(operator_key)
        plan.add_api_stage(stage=api.deployment_stage)

        # ── 7. IoT Core ───────────────────────────────────────────────────
        # Device policy: a certificate with this policy may only
        #   - connect with a client id starting with "shipment-simulator-"
        #   - publish to shipments/<id>/location
        # Certificates are created by scripts/provision_device.py (keeping the
        # private key out of CloudFormation state) and attached to this policy.
        iot_policy = iot.CfnPolicy(
            self, "SimulatorDevicePolicy",
            policy_name=f"ShipmentSimulatorPolicy-{stage}",
            policy_document={
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": "iot:Connect",
                        "Resource": f"arn:aws:iot:{self.region}:{self.account}:client/{IOT_CLIENT_PREFIX}-*",
                    },
                    {
                        "Effect": "Allow",
                        "Action": "iot:Publish",
                        "Resource": f"arn:aws:iot:{self.region}:{self.account}:topic/{IOT_TOPIC_PREFIX}/*/location",
                    },
                ],
            },
        )

        iot_kinesis_role = iam.Role(
            self, "IoTKinesisRole",
            assumed_by=iam.ServicePrincipal("iot.amazonaws.com"),
            description="Allows IoT Core to put records into Kinesis",
        )
        stream.grant_write(iot_kinesis_role)

        iot_dlq_role = iam.Role(
            self, "IoTDLQRole",
            assumed_by=iam.ServicePrincipal("iot.amazonaws.com"),
            description="Allows IoT Core rule error action to write to DLQ",
        )
        dlq.grant_send_messages(iot_dlq_role)

        # Partition key = topic(2), the shipment id from the MQTT topic, so all
        # events of one truck land on the same shard in order.
        iot.CfnTopicRule(
            self, "ShipmentLocationRule",
            rule_name=f"shipment_location_to_kinesis_{stage}",
            topic_rule_payload=iot.CfnTopicRule.TopicRulePayloadProperty(
                sql=f"SELECT * FROM '{IOT_TOPIC_PREFIX}/+/location'",
                aws_iot_sql_version="2016-03-23",
                actions=[
                    iot.CfnTopicRule.ActionProperty(
                        kinesis=iot.CfnTopicRule.KinesisActionProperty(
                            role_arn=iot_kinesis_role.role_arn,
                            stream_name=stream.stream_name,
                            partition_key="${topic(2)}",
                        )
                    )
                ],
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

        # ── 8. Frontend deployment ────────────────────────────────────────
        # config.json is generated at deploy time with the real API URL, so the
        # same build artefact works in any stage (no rebuild per environment).
        if deploy_frontend:
            s3deploy.BucketDeployment(
                self, "DashboardDeploy",
                sources=[
                    s3deploy.Source.asset(str(DASHBOARD_DIST)),
                    s3deploy.Source.json_data("config.json", {
                        "apiUrl": api.url,
                        "stage":  stage,
                    }),
                ],
                destination_bucket=site_bucket,
                distribution=distribution,
                distribution_paths=["/*"],
                memory_limit=512,
            )

        # ── 9. Observability ──────────────────────────────────────────────
        alarm_topic = sns.Topic(self, "AlarmTopic", display_name=f"Shipment Tracker alarms ({stage})")
        if alert_email:
            alarm_topic.add_subscription(subs.EmailSubscription(alert_email))

        def alarm(id_: str, metric: cw.IMetric, threshold: float, description: str, periods: int = 1):
            a = cw.Alarm(
                self, id_,
                metric=metric,
                threshold=threshold,
                evaluation_periods=periods,
                comparison_operator=cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
                treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
                alarm_description=description,
            )
            a.add_alarm_action(cw_actions.SnsAction(alarm_topic))
            return a

        iterator_age = stream.metric_get_records_iterator_age_milliseconds(
            statistic="Maximum", period=Duration.minutes(1))
        dlq_depth = dlq.metric_approximate_number_of_messages_visible(period=Duration.minutes(1))
        api_5xx = api.metric_server_error(period=Duration.minutes(5))
        api_latency = api.metric_latency(period=Duration.minutes(1), statistic="p95")

        alarm("DlqNotEmptyAlarm", dlq_depth, 1,
              "Events landed in the DLQ — inspect and replay.")
        alarm("ProcessErrorsAlarm", process_fn.metric_errors(period=Duration.minutes(5)), 1,
              "process_event Lambda is failing.")
        alarm("StreamLagAlarm", iterator_age, 30_000,
              "Kinesis consumer is >30 s behind — the <5 s latency target is broken.", periods=3)
        alarm("Api5xxAlarm", api_5xx, 5, "API Gateway is returning 5xx errors.")

        cw.Dashboard(
            self, "OpsDashboard",
            dashboard_name=f"ShipmentTracker-{stage}",
            widgets=[
                [
                    cw.GraphWidget(title="IoT → Kinesis records in",
                                   left=[stream.metric_incoming_records(period=Duration.minutes(1))]),
                    cw.GraphWidget(title="Consumer lag (ms)", left=[iterator_age]),
                    cw.GraphWidget(title="DLQ depth", left=[dlq_depth]),
                ],
                [
                    cw.GraphWidget(title="process_event invocations / errors",
                                   left=[process_fn.metric_invocations(), process_fn.metric_errors()]),
                    cw.GraphWidget(title="API p95 latency (ms)", left=[api_latency]),
                    cw.GraphWidget(title="API 4xx / 5xx",
                                   left=[api.metric_client_error(), api_5xx]),
                ],
            ],
        )

        # ── 10. Cost guardrail ────────────────────────────────────────────
        # Recommended in lab 1: alert at 50 % of budget. Budgets are account-wide
        # (not stack-scoped), so this tracks total spend against the credits.
        if alert_email:
            budgets.CfnBudget(
                self, "MonthlyBudget",
                budget=budgets.CfnBudget.BudgetDataProperty(
                    budget_name=f"shipment-tracker-{stage}",
                    budget_type="COST",
                    time_unit="MONTHLY",
                    budget_limit=budgets.CfnBudget.SpendProperty(amount=monthly_budget_usd, unit="USD"),
                ),
                notifications_with_subscribers=[
                    budgets.CfnBudget.NotificationWithSubscribersProperty(
                        notification=budgets.CfnBudget.NotificationProperty(
                            notification_type=kind,
                            comparison_operator="GREATER_THAN",
                            threshold=pct,
                            threshold_type="PERCENTAGE",
                        ),
                        subscribers=[budgets.CfnBudget.SubscriberProperty(
                            subscription_type="EMAIL", address=alert_email)],
                    )
                    for kind, pct in [("ACTUAL", 50), ("ACTUAL", 80), ("FORECASTED", 100)]
                ],
            )

        # ── Outputs ───────────────────────────────────────────────────────
        CfnOutput(self, "ApiUrl", value=api.url, description="REST API base URL")
        CfnOutput(self, "OperatorApiKeyId", value=operator_key.key_id,
                  description="aws apigateway get-api-key --include-value --api-key <id> --query value --output text")
        CfnOutput(self, "IoTPolicyName", value=iot_policy.policy_name)
        CfnOutput(self, "ShipmentsTableName", value=shipments_table.table_name)
        CfnOutput(self, "EventsTableName", value=events_table.table_name)
        CfnOutput(self, "KinesisStreamName", value=stream.stream_name)
        CfnOutput(self, "DLQUrl", value=dlq.queue_url)
        if distribution:
            CfnOutput(self, "DashboardUrl", value=f"https://{distribution.distribution_domain_name}")
