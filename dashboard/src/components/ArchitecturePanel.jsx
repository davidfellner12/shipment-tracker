// src/components/ArchitecturePanel.jsx
// Full architecture + trade-off explainer for the 10-minute presentation section.
import React, { useState } from 'react';

const TABS = ['Pipeline', 'Trade-offs', 'Reliability', 'Scaling & Cost'];

const PIPELINE_LAYERS = [
  {
    num: '1',
    service: 'AWS IoT Core',
    color: '#00e5ff',
    role: 'MQTT broker — receives GPS events from the simulator over TLS (port 8883)',
    detail: 'Topic pattern: shipments/{id}/location  ·  Rule SQL: SELECT * FROM \'shipments/+/location\'  ·  QoS AT_LEAST_ONCE guarantees at-least-once delivery (duplicates handled downstream)',
  },
  {
    num: '2',
    service: 'Amazon Kinesis',
    color: '#7c4dff',
    role: 'Event stream — buffers and orders GPS events before Lambda processing',
    detail: '1 shard  ·  24 h retention  ·  Ordered-per-shard  ·  Partition key = shipmentId ensures all events for one truck go to the same shard in order',
  },
  {
    num: '3',
    service: 'AWS Lambda',
    color: '#ff6d00',
    role: 'Stream processor — decodes, enriches, and upserts each event to DynamoDB',
    detail: 'Enrichment: derives status label (IN_TRANSIT / DELAYED / ARRIVING_SOON) and ETA from speed + remaining distance  ·  Idempotent: conditional write rejects stale duplicates  ·  Batch size 10  ·  3 retries with bisect-on-error',
  },
  {
    num: '4',
    service: 'Amazon DynamoDB',
    color: '#00e676',
    role: 'State store — holds the latest position and status of every shipment',
    detail: 'PAY_PER_REQUEST (on-demand)  ·  Partition key: shipmentId  ·  TTL = 24 h (automatic event expiry)  ·  AWS-managed encryption at rest  ·  Single-digit ms reads',
  },
  {
    num: '5',
    service: 'API Gateway + React',
    color: '#ffab00',
    role: 'REST API + dashboard — exposes shipment data to the browser; Leaflet map',
    detail: 'GET /shipments  ·  GET /shipments/{id}  ·  PUT /shipments/{id} (delay toggle)  ·  Dashboard polls every 2 s → total end-to-end latency ≤ 4 s  ·  Mock mode runs without AWS for offline demo',
  },
];

const TRADEOFFS = [
  {
    title: 'Kinesis vs Direct IoT → Lambda',
    chosen: 'Kinesis Data Stream',
    alternative: 'IoT Core rules engine → Lambda directly',
    pros: [
      '24 h replay — redeployed Lambda can reprocess missed events',
      'Strict ordering per shard — no out-of-order position jumps',
      'Fan-out — future analytics consumers tap the same stream',
      'Back-pressure — Kinesis absorbs bursts; Lambda scales smoothly',
    ],
    cons: [
      '~$0.015/shard/hour cost (direct routing is free via rule action)',
      'Extra hop adds ~50–200 ms latency vs direct invocation',
    ],
    verdict: 'For PoC the cost difference is cents; replay and ordering justify the choice.',
  },
  {
    title: 'REST Polling vs WebSocket / Push',
    chosen: 'REST polling every 2 s',
    alternative: 'API Gateway WebSocket API  or  IoT Core MQTT-over-WebSocket',
    pros: [
      'Simple: no connection-management Lambda or connection table',
      '2 s poll + ~1–2 s pipeline = ≤ 4 s total — satisfies <5 s target',
      'Stateless — works behind any CDN or API Gateway cache',
    ],
    cons: [
      'Dashboard makes ~43 000 API calls/day per browser tab',
      'Push (WebSocket) would deliver in <1 s after DynamoDB write',
    ],
    verdict: 'WebSocket is the production choice; REST polling satisfies the PoC latency budget at much lower implementation cost.',
  },
  {
    title: 'ETA Calculation Method',
    chosen: 'Simple distance/speed division',
    alternative: 'AWS Location Service route calculator (real road network + traffic)',
    pros: [
      'Zero extra cost — runs inside process_event Lambda',
      'Sufficient accuracy for demo with simulated straight-line routes',
    ],
    cons: [
      'Ignores road network — overestimates speed on mountain segments',
      'No live traffic — delayed trucks may recover faster in reality',
    ],
    verdict: 'Production would call Location Service ($0.60 per 1 000 route calculations). ETA formula: (route_km × (1 − progress)) / speed_kmh × 60.',
  },
  {
    title: 'DynamoDB Capacity Mode',
    chosen: 'PAY_PER_REQUEST (on-demand)',
    alternative: 'Provisioned throughput + auto-scaling',
    pros: [
      'No capacity planning — handles zero-to-spike demo traffic instantly',
      'Cheaper for sporadic / low-volume PoC workloads',
    ],
    cons: [
      'Higher per-request cost at high steady-state throughput',
      'Provisioned + auto-scaling is ~40% cheaper for a stable production fleet',
    ],
    verdict: 'On-demand is the correct choice for an unpredictable demo. Production: provisioned with auto-scaling once fleet rate is stable.',
  },
];

const RELIABILITY = [
  {
    pillar: 'Failure Handling',
    items: [
      'Lambda retries failed Kinesis batches 3 times with bisect-on-error (bad record isolated, rest of batch continues)',
      'SQS Dead-Letter Queue captures events that exhaust retries — 14-day retention for ops inspection & replay',
      'IoT Core error action routes failed Kinesis PUT messages to the same DLQ',
      'API Gateway returns 500 on Lambda errors; dashboard shows error banner and retries automatically',
    ],
  },
  {
    pillar: 'Idempotency',
    items: [
      'MQTT QoS AT_LEAST_ONCE can deliver the same GPS event multiple times (network retries, simulator restart)',
      'DynamoDB conditional write: attribute_not_exists(shipmentId) OR timestamp < new_timestamp',
      'ConditionalCheckFailedException = duplicate/stale event → logged and skipped, not counted as error',
      'Ensures position never goes backwards even if events arrive out of order',
    ],
  },
  {
    pillar: 'Security',
    items: [
      'IoT Core: mutual TLS (mTLS) — device certificate + private key required to connect',
      'IAM least-privilege: each Lambda has a dedicated role with only the permissions it needs',
      'DynamoDB encrypted at rest with AWS-managed keys',
      'API Gateway throttled: 100 rps sustained / 200 rps burst — prevents runaway poll loops',
      'No secrets in code — all config loaded from environment variables injected by CDK',
    ],
  },
  {
    pillar: 'Data Retention',
    items: [
      'DynamoDB TTL = 24 h — expired shipment records deleted automatically at no cost',
      'Kinesis retention = 24 h — events replayable for a full day after ingestion',
      'DLQ retention = 14 days — failed events available for investigation and manual replay',
      'CloudWatch Logs retention = 1 week (configurable per Lambda)',
    ],
  },
];

const COST_ROWS = [
  { service: 'AWS IoT Core',     unit: 'Per message',          rate: '$1.00 / 100K msg',     demo: '$0.003',  production: '$0.18 / day (10K trucks)' },
  { service: 'Amazon Kinesis',   unit: 'Per shard-hour',       rate: '$0.015 / shard-h',     demo: '$0.015',  production: '$10.8/mo (30 shards)' },
  { service: 'AWS Lambda',       unit: 'Per invocation + GB-s', rate: '$0.20 / 1M req',      demo: '$0.001',  production: '$2 / day' },
  { service: 'Amazon DynamoDB',  unit: 'Per write/read unit',  rate: '$1.25 / 1M WRU',       demo: '$0.001',  production: '$5 / day' },
  { service: 'API Gateway',      unit: 'Per request',          rate: '$3.50 / 1M req',       demo: '$0.002',  production: '$0.50 / day' },
  { service: 'SQS (DLQ)',        unit: 'Per request',          rate: '$0.40 / 1M req',       demo: '< $0.001', production: 'Negligible' },
];

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--bg-card)' : 'none',
      border: 'none',
      borderBottom: active ? '2px solid var(--neon-cyan)' : '2px solid transparent',
      color: active ? 'var(--neon-cyan)' : 'var(--text-muted)',
      fontFamily: 'var(--font-display)',
      fontSize: '11px',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      padding: '10px 16px',
      cursor: 'pointer',
    }}>{label}</button>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em',
      color: 'var(--text-muted)', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '14px',
    }}>{children}</div>
  );
}

export default function ArchitecturePanel({ onClose }) {
  const [tab, setTab] = useState(0);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(9,12,16,0.93)',
      zIndex: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        width: '860px', maxHeight: '92vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-bright)',
        borderTop: '2px solid var(--neon-cyan)',
        borderRadius: '4px',
        display: 'flex', flexDirection: 'column',
        animation: 'fade-in-up 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 0', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)', flexShrink: 0,
        }}>
          <div style={{ paddingBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '18px', color: 'var(--neon-cyan)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              AWS Architecture
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.08em', marginTop: '2px' }}>
              5-layer serverless pipeline  ·  Well-Architected: Cost · Security · Performance · Reliability
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-bright)',
            color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px',
            fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.1em', borderRadius: '2px',
            marginBottom: '12px',
          }}>CLOSE ✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
          {TABS.map((t, i) => <Tab key={t} label={t} active={tab === i} onClick={() => setTab(i)} />)}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {/* ── Pipeline tab ─────────────────────────────────────────── */}
          {tab === 0 && (
            <div>
              {/* ASCII flow */}
              <div style={{
                fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-cyan)',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                padding: '16px 20px', borderRadius: '2px', marginBottom: '20px',
                letterSpacing: '0.04em', lineHeight: 1.8,
              }}>
                {'[Simulator] ──MQTT/TLS──▶ [IoT Core] ──Rule──▶ [Kinesis Stream]'}
                <br/>
                {'                                                      │'}
                <br/>
                {'                                                      ▼ Trigger (batch 10)'}
                <br/>
                {'[Dashboard] ◀──REST poll 2s── [API GW] ◀── [Lambda: get]    [Lambda: process] ──▶ [DynamoDB]'}
                <br/>
                {'                                │                                                         │'}
                <br/>
                {'                          [Lambda: update]                                           TTL 24h'}
                <br/>
                {'                          PUT /shipments/{id}                                             │'}
                <br/>
                {'                                                          [SQS DLQ] ◀── failed batches ──┘'}
              </div>

              {/* Layer cards */}
              {PIPELINE_LAYERS.map((layer) => (
                <div key={layer.num} style={{
                  display: 'flex', gap: '14px', marginBottom: '12px',
                  padding: '14px', background: 'var(--bg-card)',
                  border: `1px solid var(--border)`, borderLeft: `3px solid ${layer.color}`,
                  borderRadius: '2px',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: layer.color + '22', border: `1px solid ${layer.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--text-mono)', fontSize: '13px', color: layer.color,
                    flexShrink: 0,
                  }}>{layer.num}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: layer.color, letterSpacing: '0.06em', marginBottom: '3px' }}>
                      {layer.service}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-primary)', marginBottom: '5px' }}>
                      {layer.role}
                    </div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {layer.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Trade-offs tab ───────────────────────────────────────── */}
          {tab === 1 && (
            <div>
              {TRADEOFFS.map((t) => (
                <div key={t.title} style={{
                  marginBottom: '20px', padding: '16px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--neon-cyan)', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    {t.title}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ padding: '10px', background: 'rgba(0,230,118,0.06)', border: '1px solid var(--neon-green)', borderRadius: '2px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--neon-green)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Chosen: {t.chosen}
                      </div>
                      {t.pros.map(p => (
                        <div key={p} style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', gap: '6px' }}>
                          <span style={{ color: 'var(--neon-green)', flexShrink: 0 }}>+</span>{p}
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(255,23,68,0.05)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: '2px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--neon-red)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Alternative: {t.alternative}
                      </div>
                      {t.cons.map(c => (
                        <div key={c} style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', gap: '6px' }}>
                          <span style={{ color: 'var(--neon-red)', flexShrink: 0 }}>−</span>{c}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--neon-amber)',
                    padding: '8px 10px', background: 'rgba(255,171,0,0.07)',
                    border: '1px solid rgba(255,171,0,0.3)', borderRadius: '2px',
                  }}>
                    Verdict: {t.verdict}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Reliability tab ──────────────────────────────────────── */}
          {tab === 2 && (
            <div>
              {RELIABILITY.map((section) => (
                <div key={section.pillar} style={{ marginBottom: '20px' }}>
                  <SectionHead>{section.pillar}</SectionHead>
                  {section.items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: '10px', marginBottom: '8px',
                      padding: '10px 12px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: '2px',
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-cyan)', flexShrink: 0, marginTop: '4px' }} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Fallback outcome */}
              <div style={{ padding: '14px', background: 'rgba(0,230,118,0.06)', border: '1px solid var(--neon-green)', borderRadius: '2px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--neon-green)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Fallback Outcome
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  If the AWS pipeline is unavailable, the dashboard automatically falls back to built-in mock data (VITE_API_URL unset). The simulator → database → dashboard loop already proves the full data flow. The demo can show map tracking, delay toggling, and the cost panel without any live AWS connection — providing a reliable fallback for a live presentation.
                </div>
              </div>
            </div>
          )}

          {/* ── Scaling & Cost tab ───────────────────────────────────── */}
          {tab === 3 && (
            <div>
              <SectionHead>AWS Cost per Shipment Tracked (Unit Economics)</SectionHead>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Based on 1 GPS event every 3 s per shipment. Free tier excluded.
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px', overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', padding: '8px 12px', gap: '8px' }}>
                  {['Service', 'Charged Per', 'Rate', 'PoC Demo (~2h)', 'Production Fleet'].map(h => (
                    <div key={h} style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</div>
                  ))}
                </div>
                {COST_ROWS.map((row, i) => (
                  <div key={row.service} style={{
                    display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr',
                    padding: '9px 12px', gap: '8px',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--neon-cyan)' }}>{row.service}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{row.unit}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{row.rate}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--neon-green)' }}>{row.demo}</div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{row.production}</div>
                  </div>
                ))}
                <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>Total PoC estimate (10 shipments, 2 h demo)</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '14px', color: 'var(--neon-green)' }}>{'< $0.05'}</div>
                </div>
              </div>

              <SectionHead>Scaling Story</SectionHead>
              {[
                { trigger: 'PoC (10 trucks)',           config: '1 Kinesis shard  ·  128 MB Lambda  ·  DynamoDB on-demand',         note: 'Current setup — well within free tier' },
                { trigger: '~1 000 trucks',             config: '1–2 shards  ·  Lambda concurrency auto-scales  ·  DynamoDB on-demand', note: 'No architecture change needed' },
                { trigger: '~10 000 trucks',            config: '10+ shards  ·  Lambda 512 MB  ·  DynamoDB provisioned + auto-scaling', note: 'Increase shard count; watch hot-partition risk' },
                { trigger: '100 000+ trucks (production)', config: 'Kinesis Enhanced Fan-Out  ·  DynamoDB Global Tables  ·  CloudFront + WebSocket', note: 'Full multi-region; switch REST → WebSocket push' },
              ].map(row => (
                <div key={row.trigger} style={{
                  display: 'flex', gap: '12px', marginBottom: '8px',
                  padding: '10px 12px', background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: '2px',
                }}>
                  <div style={{ minWidth: '140px', fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--neon-amber)', flexShrink: 0 }}>{row.trigger}</div>
                  <div style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)' }}>{row.config}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', minWidth: '180px' }}>{row.note}</div>
                </div>
              ))}

              <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(255,171,0,0.06)', border: '1px solid rgba(255,171,0,0.3)', borderRadius: '2px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--neon-amber)', lineHeight: 1.6 }}>
                  Hot-partition concern: if one shipment ID receives a very high GPS rate, it could create a hot shard. Mitigation: add a random suffix to the Kinesis partition key (e.g., shipmentId + random 0–9) to spread writes across shards, then aggregate in a downstream Lambda.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
