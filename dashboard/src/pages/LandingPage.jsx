// src/pages/LandingPage.jsx
import React, { useEffect, useState } from 'react';

const PIPELINE = [
  { num: '01', name: 'AWS IoT Core',    color: '#00e5ff', icon: '📡', desc: 'Receives GPS events from trucks via MQTT over TLS' },
  { num: '02', name: 'Amazon Kinesis',  color: '#7c4dff', icon: '⚡', desc: 'Streams events in real time — ordered, replayable, scalable' },
  { num: '03', name: 'AWS Lambda',      color: '#ff6d00', icon: '⚙', desc: 'Processes & enriches each event: status, ETA, idempotency' },
  { num: '04', name: 'Amazon DynamoDB', color: '#00e676', icon: '🗄', desc: 'Stores live shipment state with 24 h TTL — single-digit ms reads' },
  { num: '05', name: 'API Gateway',     color: '#ffab00', icon: '🌐', desc: 'REST API + React dashboard with live map and metrics' },
];

const PROBLEM_STATS = [
  { value: '34%', label: 'avg. delay from blind spots',      color: '#ff1744', sub: 'Shipments miss windows due to missing visibility' },
  { value: '€18K', label: 'avg. monthly cost of lost parcels', color: '#ffab00', sub: 'Untracked parcels cost logistics firms every month' },
  { value: '60%', label: 'customer calls are "where is my order?"', color: '#ffab00', sub: 'Support teams overwhelmed by status requests' },
];

const SOLUTION_STATS = [
  { value: '< 5 s', label: 'End-to-end latency',     color: '#00e5ff' },
  { value: '< $5',  label: 'Full PoC AWS cost',       color: '#39ff14' },
  { value: '10',    label: 'Simulated truck routes',   color: '#00e5ff' },
  { value: '100%',  label: 'Serverless — no servers',  color: '#39ff14' },
];

const FEATURES = [
  { icon: '🗺', title: 'Live Map Tracking', desc: 'All shipments visible on an interactive Leaflet map. Truck positions update every 2 seconds from the AWS pipeline.' },
  { icon: '⚠', title: 'Delay Alerts', desc: 'Instant visual and log alerts when a shipment is flagged as delayed. Toggle delay status live during the demo.' },
  { icon: '📊', title: 'Analytics Dashboard', desc: 'Full-fleet metrics: delay costs, cargo values, speed distribution, on-time rates, AWS unit economics per shipment.' },
  { icon: '🏗', title: 'Architecture Explorer', desc: 'Interactive panel explaining every AWS service choice, trade-off, failure handling, idempotency, and scaling story.' },
  { icon: '📦', title: 'Shipment Deep-Dive', desc: 'Detailed page per shipment: 5 tabs covering overview, route timeline, cargo & documents, contacts, and vehicle info.' },
  { icon: '🔒', title: 'Well-Architected', desc: 'IAM least-privilege, mTLS for IoT, DynamoDB encrypted at rest, API Gateway throttling, SQS dead-letter queue.' },
];

function Section({ id, children, style }) {
  return (
    <section id={id} style={{ padding: '80px 0', borderBottom: '1px solid var(--border)', ...style }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 40px' }}>
        {children}
      </div>
    </section>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.3em',
      color: 'var(--neon-cyan)', textTransform: 'uppercase', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <div style={{ width: '30px', height: '1px', background: 'var(--neon-cyan)' }} />
      {children}
      <div style={{ width: '30px', height: '1px', background: 'var(--neon-cyan)' }} />
    </div>
  );
}

function H2({ children }) {
  return (
    <h2 style={{
      fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '38px',
      color: 'var(--text-primary)', letterSpacing: '0.04em',
      lineHeight: 1.1, marginBottom: '32px',
    }}>{children}</h2>
  );
}

export default function LandingPage({ onEnter }) {
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTicker(x => (x + 1) % 4), 600);
    return () => clearInterval(t);
  }, []);
  const cursor = ticker < 2 ? '█' : ' ';

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', overflowY: 'auto', height: '100%' }}>

      {/* ── Hero ── */}
      <section style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', padding: '40px',
        background: `
          radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,229,255,0.06) 0%, transparent 70%),
          repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(0,229,255,0.015) 40px, rgba(0,229,255,0.015) 41px),
          repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,229,255,0.015) 40px, rgba(0,229,255,0.015) 41px)
        `,
      }}>
        {/* University badge */}
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.3em',
          color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '32px',
          display: 'flex', gap: '12px', alignItems: 'center',
        }}>
          <span>TU Wien</span>
          <span style={{ color: 'var(--border-bright)' }}>×</span>
          <span>Amazon Web Services</span>
          <span style={{ color: 'var(--border-bright)' }}>·</span>
          <span>2026</span>
        </div>

        {/* Logo */}
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '96px',
          letterSpacing: '0.12em', color: 'var(--neon-cyan)',
          textShadow: '0 0 60px rgba(0,229,255,0.4), 0 0 120px rgba(0,229,255,0.15)',
          lineHeight: 1, marginBottom: '8px', textTransform: 'uppercase',
          animation: 'neon-flicker 8s infinite',
        }}>
          ShipTrack{cursor}
        </div>

        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '18px',
          letterSpacing: '0.25em', color: 'var(--text-secondary)', textTransform: 'uppercase',
          marginBottom: '48px',
        }}>
          Real-Time Logistics Visibility · Powered by AWS Serverless
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: '40px', marginBottom: '56px' }}>
          {SOLUTION_STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--text-mono)', fontSize: '28px',
                color: s.color, lineHeight: 1,
                textShadow: `0 0 20px ${s.color}60`,
              }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={onEnter}
            style={{
              padding: '14px 40px',
              background: 'var(--neon-cyan)',
              border: 'none', borderRadius: '3px',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px',
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#000', cursor: 'pointer',
              boxShadow: '0 0 30px rgba(0,229,255,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 50px rgba(0,229,255,0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(0,229,255,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Enter Dashboard →
          </button>
          <button
            onClick={() => document.getElementById('problem').scrollIntoView({ behavior: 'smooth' })}
            style={{
              padding: '14px 32px',
              background: 'none',
              border: '1px solid var(--border-bright)', borderRadius: '3px',
              fontFamily: 'var(--font-display)', fontSize: '12px',
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neon-cyan)'; e.currentTarget.style.color = 'var(--neon-cyan)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Learn More ↓
          </button>
        </div>

        {/* Scroll hint */}
        <div style={{
          position: 'absolute', bottom: '32px',
          fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.2em',
          color: 'var(--text-muted)', textTransform: 'uppercase',
          animation: 'blink 2s ease-in-out infinite',
        }}>↓ scroll to explore</div>
      </section>

      {/* ── Problem ── */}
      <Section id="problem">
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <SectionLabel>The Problem</SectionLabel>
          <H2>Logistics Without Visibility Is Costly</H2>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '620px', margin: '0 auto', lineHeight: 1.7 }}>
            Logistics companies lose revenue and customer trust because they cannot tell clients where a shipment is right now. Tracking is done manually — slow, inaccurate, and unscalable.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          {PROBLEM_STATS.map(s => (
            <div key={s.value} style={{
              padding: '32px 28px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderTop: `3px solid ${s.color}`,
              borderRadius: '4px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--text-mono)', fontSize: '56px', lineHeight: 1,
                color: s.color, textShadow: `0 0 30px ${s.color}50`,
                marginBottom: '12px',
              }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                {s.label}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Solution / Architecture ── */}
      <Section id="solution" style={{ background: 'var(--bg-surface)' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <SectionLabel>The Solution</SectionLabel>
          <H2>A 5-Layer Serverless AWS Pipeline</H2>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto', lineHeight: 1.7 }}>
            GPS events flow from simulated trucks through IoT Core → Kinesis → Lambda → DynamoDB to the live dashboard in under 5 seconds. 100% serverless — pay only for what you use.
          </p>
        </div>

        {/* Pipeline flow */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0', marginBottom: '48px' }}>
          {PIPELINE.map((layer, i) => (
            <React.Fragment key={layer.num}>
              <div style={{
                flex: 1,
                padding: '24px 20px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderTop: `3px solid ${layer.color}`,
                borderRadius: '4px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center', gap: '10px',
              }}>
                <div style={{ fontSize: '28px', lineHeight: 1 }}>{layer.icon}</div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: layer.color, letterSpacing: '0.2em' }}>{layer.num}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', color: layer.color, letterSpacing: '0.06em', lineHeight: 1.2 }}>{layer.name}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{layer.desc}</div>
              </div>
              {i < PIPELINE.length - 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '0 6px',
                  fontFamily: 'var(--text-mono)', fontSize: '20px', color: 'var(--border-bright)',
                  flexShrink: 0,
                }}>→</div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Key guarantees row */}
        {[
          { icon: '🔁', label: 'Idempotent',   desc: 'Duplicate GPS events rejected via DynamoDB conditional write' },
          { icon: '💀', label: 'Failure Safe',  desc: 'SQS Dead-Letter Queue captures failed events after 3 retries' },
          { icon: '🔒', label: 'Secure',        desc: 'mTLS for IoT · IAM least-privilege · Encrypted at rest' },
          { icon: '📏', label: 'Ordered',       desc: 'Kinesis partitions per shipmentId — no out-of-order updates' },
        ].map(g => (
          <div key={g.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 20px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '3px', marginRight: '10px', marginTop: '10px' }}>
            <span style={{ fontSize: '18px' }}>{g.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>{g.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)' }}>{g.desc}</div>
            </div>
          </div>
        ))}
      </Section>

      {/* ── Features ── */}
      <Section id="features">
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <SectionLabel>Capabilities</SectionLabel>
          <H2>Everything You Need for a Live Demo</H2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              padding: '28px 24px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--neon-cyan)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ fontSize: '28px', marginBottom: '14px' }}>{f.icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '0.05em' }}>{f.title}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── CTA ── */}
      <Section style={{ background: `radial-gradient(ellipse 60% 80% at 50% 50%, rgba(0,229,255,0.05) 0%, transparent 70%)`, borderBottom: 'none' }}>
        <div style={{ textAlign: 'center' }}>
          <SectionLabel>Ready</SectionLabel>
          <H2>See It Running Live</H2>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 40px', lineHeight: 1.7 }}>
            The dashboard runs on mock data out of the box — no AWS credentials needed. Deploy the CDK stack to connect the real pipeline.
          </p>
          <button
            onClick={onEnter}
            style={{
              padding: '16px 56px',
              background: 'var(--neon-cyan)',
              border: 'none', borderRadius: '3px',
              fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '14px',
              letterSpacing: '0.25em', textTransform: 'uppercase',
              color: '#000', cursor: 'pointer',
              boxShadow: '0 0 40px rgba(0,229,255,0.35)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 60px rgba(0,229,255,0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 40px rgba(0,229,255,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Open Dashboard →
          </button>
          <div style={{ marginTop: '40px', fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
            David Fellner · TU Wien Data & Analytics · Project in CS 2 · 2026
          </div>
        </div>
      </Section>
    </div>
  );
}
