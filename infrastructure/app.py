"""
CDK entry point — Real-Time Shipment Tracker
TU Wien × AWS 2026 — David Fellner

  cdk deploy -c alertEmail=you@example.com                # dev stage
  cdk deploy -c stage=prod -c alertEmail=you@example.com  # retain data, PITR on
"""

import aws_cdk as cdk

from stack import ShipmentTrackerStack

app = cdk.App()
ctx = app.node.try_get_context

stage = ctx("stage") or "dev"
extra_origins = [o.strip() for o in (ctx("allowedOrigins") or "http://localhost:3000").split(",") if o.strip()]

stack = ShipmentTrackerStack(
    app,
    f"ShipmentTrackerStack-{stage}",
    stage=stage,
    alert_email=ctx("alertEmail"),
    monthly_budget_usd=float(ctx("monthlyBudget") or 10),
    extra_origins=extra_origins,
    env=cdk.Environment(
        account=ctx("account"),
        region=ctx("region") or "eu-central-1",
    ),
    description=f"TU Wien × AWS 2026 — Real-Time Shipment Tracker ({stage})",
)
cdk.Tags.of(stack).add("project", "shipment-tracker")
cdk.Tags.of(stack).add("stage", stage)

app.synth()
