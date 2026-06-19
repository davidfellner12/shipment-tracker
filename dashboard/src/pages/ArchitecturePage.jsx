// src/pages/ArchitecturePage.jsx
import React, { useState } from 'react';
import NavBar from '../components/NavBar';

const TABS = ['Pipeline', 'Trade-offs', 'Reliability', 'Scaling & Cost'];

const LAYERS = [
  { num: '1', name: 'AWS IoT Core',    color: '#00e5ff', icon: '📡',
    role: 'MQTT broker — receives GPS events from trucks over TLS (port 8883)',
    detail: 'Topic pattern: shipments/{id}/location  ·  SQL: SELECT * FROM \'shipments/+/location\'  ·  QoS AT_LEAST_ONCE (duplicates handled downstream via idempotency)' },
  { num: '2', name: 'Amazon Kinesis',  color: '#7c4dff', icon: '⚡',
    role: 'Event stream — buffers, orders, and fans out GPS events before Lambda processing',
    detail: '1 shard (1 MB/s capacity)  ·  24 h retention for replay  ·  Ordered per shard  ·  Partition key = shipmentId ensures one truck → one shard → ordered delivery' },
  { num: '3', name: 'AWS Lambda',      color: '#ff6d00', icon: '⚙',
    role: 'Stream processor — decodes, enriches, and idempotently upserts each event to DynamoDB',
    detail: 'Enrichment: status label + ETA (remaining_km / speed × 60)  ·  Idempotent: DynamoDB conditional write rejects stale duplicates  ·  Batch 10  ·  3 retries + bisect-on-error  ·  Failed → SQS DLQ' },
  { num: '4', name: 'Amazon DynamoDB', color: '#00e676', icon: '🗄',
    role: 'State store — holds the latest position and status of every shipment',
    detail: 'PAY_PER_REQUEST (on-demand, no capacity planning for PoC)  ·  Partition key: shipmentId  ·  TTL = 24 h (auto-expiry)  ·  AWS-managed encryption at rest  ·  Single-digit ms reads' },
  { num: '5', name: 'API Gateway + React', color: '#ffab00', icon: '🌐',
    role: 'REST API + live dashboard — exposes shipment data to browser; Leaflet map; React SPA',
    detail: 'GET /shipments  ·  GET /shipments/{id}  ·  PUT /shipments/{id} (delay toggle)  ·  Poll every 2 s  ·  Total latency ≤ 4 s  ·  Mock mode: runs offline with no AWS' },
];

const TRADEOFFS = [
  {
    title: 'Kinesis vs Direct IoT → Lambda',
    chosen: 'Kinesis Data Stream',
    alt: 'IoT Core rules engine → Lambda directly',
    pros: ['24 h replay: redeployed Lambda can reprocess missed events', 'Strict ordering per shard: no out-of-order position jumps', 'Fan-out: future analytics consumers can read the same stream', 'Back-pressure: Kinesis absorbs bursts, Lambda scales smoothly'],
    cons: ['~$0.015/shard/h cost (direct routing via rule action is free)', 'Extra hop adds ~50–200 ms vs direct invocation'],
    verdict: 'For a PoC the cost difference is cents. Replay, ordering, and fan-out justify the choice for a production-bound design.',
  },
  {
    title: 'REST Polling vs WebSocket / Push',
    chosen: 'REST polling every 2 s',
    alt: 'API Gateway WebSocket API or IoT Core MQTT-over-WebSocket',
    pros: ['Simple: no connection-management Lambda or DynamoDB connection table', '2 s poll + ~1–2 s pipeline = ≤ 4 s total — satisfies the <5 s target', 'Stateless — works behind any CDN or API Gateway cache'],
    cons: ['~43 000 API calls/day per open browser tab', 'WebSocket push delivers in <1 s after the DynamoDB write'],
    verdict: 'WebSocket is the production choice. REST polling satisfies the PoC latency budget at far lower implementation cost.',
  },
  {
    title: 'ETA Calculation Method',
    chosen: 'Simple distance/speed division',
    alt: 'AWS Location Service route calculator (real road network + traffic)',
    pros: ['Zero extra cost — runs inside process_event Lambda', 'Sufficient for demo with straight-line simulated routes'],
    cons: ['No road network: overestimates speed on mountain segments', 'No live traffic: delayed trucks may recover faster in reality'],
    verdict: 'Formula: (route_km × (1 − progress)) / speed_kmh × 60. Production: Location Service at $0.60 per 1 000 route calculations.',
  },
  {
    title: 'DynamoDB Capacity Mode',
    chosen: 'PAY_PER_REQUEST (on-demand)',
    alt: 'Provisioned throughput + auto-scaling',
    pros: ['No capacity planning needed for unpredictable demo traffic', 'Handles zero-to-spike instantly with no throttling risk'],
    cons: ['Higher per-request cost at high steady-state throughput', 'Provisioned + auto-scaling is ~40% cheaper for a stable production fleet'],
    verdict: 'On-demand is correct for an unpredictable demo. Switch to provisioned + auto-scaling once the fleet rate stabilises.',
  },
];

const RELIABILITY = [
  { title: 'Failure Handling', items: [
    'Lambda: 3 retries with bisect-on-error — a single bad record is isolated; the rest of the batch continues',
    'SQS Dead-Letter Queue: events that exhaust retries are preserved for 14 days for manual inspection and replay',
    'IoT Core error action: if the Kinesis PUT fails, the raw MQTT message is also routed to the DLQ',
    'API Gateway: returns 500 on Lambda errors; the dashboard shows an error banner and retries automatically every 2 s',
  ]},
  { title: 'Idempotency', items: [
    'MQTT QoS AT_LEAST_ONCE can deliver the same GPS event multiple times (network retries, simulator restarts)',
    'DynamoDB conditional write: attribute_not_exists(shipmentId) OR timestamp < new_timestamp',
    'ConditionalCheckFailedException = duplicate or stale event → logged and skipped, not counted as an error',
    'Ensures position never goes backwards even if events arrive out of order across shards',
  ]},
  { title: 'Security', items: [
    'IoT Core: mutual TLS (mTLS) — device certificate + private key required; no username/password',
    'IAM least-privilege: each Lambda has a dedicated role with only the permissions it needs (read or write, not both)',
    'DynamoDB encrypted at rest with AWS-managed keys; in-transit encryption enforced',
    'API Gateway throttled: 100 rps sustained / 200 rps burst — prevents runaway polling or accidental DDoS',
  ]},
  { title: 'Data Retention', items: [
    'DynamoDB TTL = 24 h — expired shipment records deleted automatically at no cost',
    'Kinesis retention = 24 h — events replayable for a full day after ingestion',
    'DLQ retention = 14 days — failed events available for ops investigation and manual replay',
    'CloudWatch Logs retention = 1 week per Lambda (configurable)',
  ]},
  { title: 'Fallback Outcome', items: [
    'Dashboard runs in mock mode when VITE_API_URL is not set — no AWS credentials needed',
    'Simulator → DynamoDB → dashboard loop already proves the full data pipeline independently',
    'Delay toggling, map tracking, analytics, and architecture explorer all work offline',
    'Even if the AWS pipeline is unavailable during the presentation, the demo can run fully on mock data',
  ]},
];

const SCALING_ROWS = [
  { fleet: 'PoC (10 trucks)',          config: '1 Kinesis shard · 128 MB Lambda · DynamoDB on-demand',           note: 'Current setup — within free tier' },
  { fleet: '~1 000 trucks',            config: '1–2 shards · Lambda concurrency auto-scales · DynamoDB on-demand',  note: 'No architecture change needed' },
  { fleet: '~10 000 trucks',           config: '10+ shards · Lambda 512 MB · DynamoDB provisioned + auto-scaling',  note: 'Increase shards; watch hot-partition risk' },
  { fleet: '100 000+ trucks (prod)',   config: 'Enhanced Fan-Out · Global Tables · CloudFront + WebSocket push',  note: 'Multi-region; REST → WebSocket' },
];

function SH({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '20px' }}>{children}</div>
  );
}

export default function ArchitecturePage({ shipments, onNavigate, latencyMs }) {
  const [tab, setTab] = useState(0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar page="architecture" onNavigate={onNavigate} shipments={shipments} latencyMs={latencyMs} />

      {/* Page header + tabs */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => onNavigate('fleet')} style={{ background: 'none', border: '1px solid var(--border-bright)', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px 14px', fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', borderRadius: '2px' }}>
            ← Fleet
          </button>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '22px', color: 'var(--neon-cyan)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AWS Architecture</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>5-layer serverless pipeline · Well-Architected: Cost · Security · Performance · Reliability</div>
          </div>
        </div>
        <div style={{ display: 'flex', paddingLeft: '40px', marginTop: '16px' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              background: 'none', border: 'none',
              borderBottom: tab === i ? '2px solid var(--neon-cyan)' : '2px solid transparent',
              color: tab === i ? 'var(--neon-cyan)' : 'var(--text-muted)',
              fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.15em',
              textTransform: 'uppercase', padding: '10px 20px',
              cursor: 'pointer', transition: 'color 0.15s',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)', padding: '32px 40px' }}>

        {/* ── Pipeline ── */}
        {tab === 0 && (
          <div style={{ maxWidth: '900px' }}>
            {/* ASCII flow */}
            <div style={{
              fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-cyan)',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              padding: '20px 24px', borderRadius: '4px', marginBottom: '28px',
              letterSpacing: '0.04em', lineHeight: 1.9, whiteSpace: 'pre',
            }}>
{`[Simulator] ──MQTT/TLS──▶ [IoT Core] ──Rule──▶ [Kinesis Stream]
                                                       │
                                                       ▼ Trigger (batch 10)
[Browser]  ◀──poll 2s── [API GW] ◀──[Lambda: get]   [Lambda: process] ──▶ [DynamoDB]
                             │                                                    │
                        [Lambda: update]                    [SQS DLQ] ◀─ failed ─┘
                        PUT /shipments/{id}                 (14-day retention)`}
            </div>

            {LAYERS.map(l => (
              <div key={l.num} style={{
                display: 'flex', gap: '16px', marginBottom: '14px',
                padding: '18px 20px', background: 'var(--bg-surface)',
                border: '1px solid var(--border)', borderLeft: `4px solid ${l.color}`, borderRadius: '4px',
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: l.color + '18', border: `1px solid ${l.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{l.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: l.color, letterSpacing: '0.05em', marginBottom: '4px' }}>{l.num}. {l.name}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px' }}>{l.role}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{l.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Trade-offs ── */}
        {tab === 1 && (
          <div style={{ maxWidth: '900px' }}>
            {TRADEOFFS.map(t => (
              <div key={t.title} style={{ marginBottom: '24px', padding: '24px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--neon-cyan)', letterSpacing: '0.05em', marginBottom: '14px' }}>{t.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div style={{ padding: '14px', background: 'rgba(0,230,118,0.05)', border: '1px solid var(--neon-green)', borderRadius: '3px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--neon-green)', textTransform: 'uppercase', marginBottom: '8px' }}>Chosen: {t.chosen}</div>
                    {t.pros.map(p => <div key={p} style={{ display: 'flex', gap: '8px', fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}><span style={{ color: 'var(--neon-green)', flexShrink: 0 }}>+</span>{p}</div>)}
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(255,23,68,0.04)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: '3px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--neon-red)', textTransform: 'uppercase', marginBottom: '8px' }}>Alternative: {t.alt}</div>
                    {t.cons.map(c => <div key={c} style={{ display: 'flex', gap: '8px', fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}><span style={{ color: 'var(--neon-red)', flexShrink: 0 }}>−</span>{c}</div>)}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--neon-amber)', padding: '10px 14px', background: 'rgba(255,171,0,0.06)', border: '1px solid rgba(255,171,0,0.3)', borderRadius: '3px' }}>
                  Verdict: {t.verdict}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Reliability ── */}
        {tab === 2 && (
          <div style={{ maxWidth: '900px' }}>
            {RELIABILITY.map(s => (
              <div key={s.title} style={{ marginBottom: '28px' }}>
                <SH>{s.title}</SH>
                {s.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '10px', padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--neon-cyan)', flexShrink: 0, marginTop: '5px' }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Scaling & Cost ── */}
        {tab === 3 && (
          <div style={{ maxWidth: '900px' }}>
            <SH>Scaling Story</SH>
            {SCALING_ROWS.map(row => (
              <div key={row.fleet} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 220px', gap: '16px', marginBottom: '10px', padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-amber)' }}>{row.fleet}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)' }}>{row.config}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{row.note}</div>
              </div>
            ))}
            <div style={{ marginTop: '12px', padding: '14px 18px', background: 'rgba(255,171,0,0.05)', border: '1px solid rgba(255,171,0,0.3)', borderRadius: '3px', fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--neon-amber)', lineHeight: 1.6 }}>
              Hot-partition concern: high-frequency GPS for one truck may create a hot shard. Mitigation: append a random 0–9 suffix to the Kinesis partition key to spread writes, then re-aggregate in a downstream Lambda.
            </div>

            <div style={{ marginTop: '32px' }}>
              <SH>AWS Cost Breakdown (eu-central-1 list prices)</SH>
              <div style={{ borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', padding: '10px 16px', background: 'var(--bg-panel)', gap: '8px' }}>
                  {['Service', 'Charged per', 'Rate', 'PoC Demo', 'Production fleet'].map(h => (
                    <div key={h} style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</div>
                  ))}
                </div>
                {[
                  ['AWS IoT Core',    'Per message',      '$1.00 / 100K', '$0.003',  '$0.18/day (10K trucks)'],
                  ['Amazon Kinesis',  'Per shard-hour',   '$0.015/sh·h',  '$0.015',  '$10.8/mo (30 shards)'],
                  ['AWS Lambda',      'Invoc + GB-s',     '$0.20 / 1M',   '$0.001',  '$2/day'],
                  ['Amazon DynamoDB', 'Per WRU/RRU',      '$1.25 / 1M',   '$0.001',  '$5/day'],
                  ['API Gateway',     'Per request',      '$3.50 / 1M',   '$0.002',  '$0.50/day'],
                  ['SQS DLQ',         'Per request',      '$0.40 / 1M',   '< $0.001','Negligible'],
                ].map(([svc, unit, rate, demo, prod], i) => (
                  <div key={svc} style={{
                    display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr',
                    padding: '11px 16px', gap: '8px',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    borderTop: '1px solid var(--border)',
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--neon-cyan)' }}>{svc}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{unit}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{rate}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-green)' }}>{demo}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{prod}</div>
                  </div>
                ))}
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Total PoC estimate (10 shipments, 2 h demo)</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '15px', color: 'var(--neon-green)' }}>{'< $0.05'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
