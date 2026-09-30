# Tracelane — Real-Time Shipment Tracker

Live tracking, predictive ETAs and customer reporting for European road freight, on AWS serverless.
TU Wien × AWS 2026 · David Fellner

## Start the app locally (no AWS needed)

Requires **Node.js 18+**.

```bash
cd dashboard
npm install
npm run dev
```

Open **http://localhost:3000**. The dashboard runs a simulated fleet of 40 trucks on real European
roads directly in your browser, in real time, with 30 days of history.
For a faster-moving demo, open **http://localhost:3000/app?speed=30**.

## Run it on AWS

Requires the **AWS CLI** (`aws configure`, region `eu-central-1`), **Python 3.11+**, and **CDK** (`npm i -g aws-cdk`).

```bash
# 1. Build the dashboard
cd dashboard && npm install && npm run build && cd ..

# 2. Deploy (≈10 min). Confirm the two emails from AWS afterwards.
cd infrastructure
pip install -r requirements.txt
cdk bootstrap                                  # first time only
cdk deploy -c alertEmail=you@example.com
cd ..

# 3. Create the simulator's device certificate
pip install boto3
python scripts/provision_device.py

# 4. Start the fleet simulator (first start publishes 30 days of history)
cd simulator
pip install -r requirements.txt
python simulator.py                          # real time, one report per truck every 30 s
# python simulator.py --speed 30 --interval 3  # fast-forward for a live demo
```

Open the `DashboardUrl` printed by `cdk deploy`.

**Flagging a shipment** from the dashboard needs the operator API key:
`aws apigateway get-api-key --api-key <OperatorApiKeyId> --include-value --query value --output text`

**Stop paying when done:**
`python scripts/provision_device.py --revoke`, then `cd infrastructure && cdk destroy`.

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest tests -q
```

## Project layout

| Folder | Contents |
|---|---|
| `dashboard/` | React app (landing page, operator control tower, customer portal, public tracking) |
| `simulator/` | Fleet simulation engine + MQTT publisher |
| `lambda/` | `process_event` (ingest), `api` (read + metrics), `update_shipment` (flag) |
| `infrastructure/` | AWS CDK stack |
| `shared/` | Road network, fictional customers/fleet, simulation parameters |
| `scripts/` | Device provisioning, network/catalog generators |
| `docs/` | [AWS services explained](docs/AWS_SERVICES.md) |

All companies, people and plates in the demo data are fictional.
