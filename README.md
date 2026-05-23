# Real-Time Shipment Tracker
**TU Wien × AWS 2026 — David Fellner**

A serverless AWS pipeline that ingests simulated GPS events, processes them in real time, and displays live shipment status on a web dashboard.

---

## Architecture

```
[Python Simulator]
       │  MQTT / IoT SDK
       ▼
[AWS IoT Core]
       │  IoT Rule → Kinesis
       ▼
[Amazon Kinesis Data Streams]
       │  Trigger
       ▼
[AWS Lambda – process_event]
       │  PutItem / UpdateItem
       ▼
[Amazon DynamoDB – ShipmentsTable]
       │  REST via API Gateway
       ▼
[AWS Lambda – get_shipments]
       │
       ▼
[React Dashboard – AWS Amplify]
```

---

## Project Structure

```
shipment-tracker/
├── simulator/          # Python GPS event simulator
├── lambda/
│   ├── process_event/  # Kinesis consumer Lambda
│   └── get_shipments/  # API Gateway Lambda
├── infrastructure/     # AWS CDK stack (Python)
├── dashboard/          # React + Vite frontend
└── README.md
```

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Python 3.11+
- AWS CLI configured (`aws configure`)
- AWS CDK CLI: `npm install -g aws-cdk`

### 2. Deploy Infrastructure
```bash
cd infrastructure
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cdk bootstrap
cdk deploy
# Note the outputs: API_URL, IOT_ENDPOINT
```

### 3. Run the Simulator
```bash
cd simulator
pip install -r requirements.txt
# Edit config.py with your IoT endpoint from CDK output
python simulator.py
```

### 4. Run the Dashboard (local dev)
```bash
cd dashboard
npm install
# Edit .env with your API_URL from CDK output
npm run dev
```

---

## Demo Script (10 min)

1. **Start simulator** — show terminal with GPS events firing
2. **Open dashboard** — shipments appear & positions update live
3. **Trigger delay** — `python simulator.py --delay SHIP-002`
4. **Show Cost Explorer** — full PoC < $5
5. **Architecture walkthrough** — explain each CDK construct

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `IOT_ENDPOINT` | simulator/config.py | From `cdk deploy` output |
| `VITE_API_URL` | dashboard/.env | From `cdk deploy` output |
| `SHIPMENTS_TABLE` | Lambda env (set by CDK) | DynamoDB table name |
| `KINESIS_STREAM` | Lambda env (set by CDK) | Kinesis stream name |
