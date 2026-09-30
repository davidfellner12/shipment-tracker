import { Cpu, Database, Radio, Waves, Globe, Cloud, ArrowRight, Gauge, Activity, Timer } from 'lucide-react';
import { api, isMock } from '../lib/api';
import { usePoll } from '../lib/session';
import { ago, num } from '../lib/format';
import { Card, Kpi, PageHeader, Pill } from '../components/ui';

const PIPELINE = [
  [Radio, 'AWS IoT Core', 'MQTT over TLS, X.509 device certs, topic rule'],
  [Waves, 'Kinesis Data Streams', 'Ordered, replayable 24 h buffer'],
  [Cpu, 'Lambda · process_event', 'Validate, dedupe (seq), write state + events'],
  [Database, 'DynamoDB', 'Shipments (state) + ShipmentEvents (timeline)'],
  [Cloud, 'API Gateway + Lambda', 'GET /shipments, /metrics · PUT with API key'],
  [Globe, 'CloudFront + S3', 'This dashboard, HTTPS, security headers'],
];

const COSTS = [
  ['Kinesis Data Streams', '1 provisioned shard', '≈ $11 / month (largest item)'],
  ['AWS IoT Core', '40 trucks × 1 msg / 30 s', '≈ $0.12 / day (≈ $1.15 / day in fast demo mode)'],
  ['Lambda, API Gateway, DynamoDB', 'on-demand', 'free tier / cents'],
  ['CloudFront + S3', 'static site', 'free tier'],
  ['CloudWatch', '4 alarms, 1 dashboard', '≈ $0.40 / month'],
];

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export default function System() {
  const { data } = usePoll(() => api.listShipments({}), [], 2000);
  const live = (data?.shipments || []).filter((s) => s.status !== 'DELIVERED');
  const lat = live.map((s) => s.ingestLatencyMs).filter((v) => v != null);
  const freshest = live.map((s) => s.lastSeenAt).sort().at(-1);
  const lost = live.filter((s) => s.exceptions.includes('SIGNAL_LOST')).length;

  return (
    <>
      <PageHeader title="System" subtitle="Serverless data pipeline on AWS">
        <Pill tone={isMock() ? 'neutral' : 'good'}>{isMock() ? 'Demo mode · in-browser simulation' : 'Connected to AWS'}</Pill>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Timer} label="Ingest latency p50" value={num(percentile(lat, 0.5))} unit="ms" context="device → DynamoDB" loading={!data} />
        <Kpi icon={Gauge} label="Ingest latency p95" value={num(percentile(lat, 0.95))} unit="ms" context="target: end-to-end < 5 s" loading={!data} />
        <Kpi icon={Activity} label="Trucks reporting" value={`${live.length - lost}/${live.length}`} loading={!data}
          context={lost ? `${lost} with signal lost` : 'all transmitting'} tone={lost ? 'critical' : 'good'} />
        <Kpi icon={Radio} label="Last message" value={freshest ? ago(freshest) : '—'} loading={!data} context="dashboard polls every 2 s" />
      </div>

      <Card title="Data flow" subtitle="Every GPS ping takes this path in about a second" className="mt-4">
        <ol className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {PIPELINE.map(([Icon, name, what], i) => (
            <li key={name} className="relative rounded-lg border border-line bg-subtle/40 p-4">
              <Icon size={18} className="text-accent" />
              <div className="mt-2 text-sm font-semibold text-ink">{name}</div>
              <div className="mt-1 text-xs leading-relaxed text-ink-3">{what}</div>
              {i < PIPELINE.length - 1 && <ArrowRight size={14} className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-ink-3 xl:block" />}
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-3 text-xs text-ink-3 md:grid-cols-3">
          <p><span className="font-medium text-ink-2">Reliability:</span> idempotent writes by sequence number, partial-batch retries, invalid messages to an SQS dead-letter queue with an alarm.</p>
          <p><span className="font-medium text-ink-2">Security:</span> least-privilege IAM per function, device policy limited to its own topic, API key on writes, encryption at rest and in transit.</p>
          <p><span className="font-medium text-ink-2">Operations:</span> everything in AWS CDK, CloudWatch alarms to email, ops dashboard, X-Ray tracing, monthly budget alerts.</p>
        </div>
      </Card>

      <Card title="Running cost" subtitle="eu-central-1, pay-per-use — no servers to run" className="mt-4">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {COSTS.map(([svc, basis, cost]) => (
              <tr key={svc}>
                <td className="py-2.5 pr-4 text-ink">{svc}</td>
                <td className="py-2.5 pr-4 text-ink-3">{basis}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-2">{cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-3">A one-week proof of concept stays under $5. Run <code className="rounded bg-subtle px-1">cdk destroy</code> afterwards — the Kinesis shard bills while idle.</p>
      </Card>
    </>
  );
}
