import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Mail,
  FlaskConical,
  RefreshCw
} from 'lucide-react';

const PRESET_SCENARIOS = [
  {
    title: 'Interested in Service',
    badge: 'Interested',
    color: '#19966B',
    text: 'Hi! We received your audit note. We are definitely interested in modernizing our clinic website and getting online appointment booking setup. Can you send over project details and next steps?'
  },
  {
    title: 'Contact in 5 Months',
    badge: 'Follow-up Later',
    color: '#3B82F6',
    text: 'We do not need this right now as our budget is locked for Q2. Please contact us again in five months to discuss.'
  },
  {
    title: 'Contact Next Quarter',
    badge: 'Follow-up Later',
    color: '#3B82F6',
    text: 'We are in the middle of an office expansion. Check back next quarter and we can review your redesign portfolio.'
  },
  {
    title: 'Please Send Pricing',
    badge: 'Interested',
    color: '#19966B',
    text: 'What are your rates for a complete dental website redesign with mobile optimization and SEO? Please send your pricing tiers.'
  },
  {
    title: 'Meeting Request',
    badge: 'Meeting Request',
    color: '#8B5CF6',
    text: 'Can we schedule a 15-minute Zoom call on Thursday afternoon to walk through the website audit findings?'
  },
  {
    title: 'Existing Provider',
    badge: 'Not Interested',
    color: '#94A3B8',
    text: 'We already have an agency on retainer who built our site last year. We are satisfied with their service, no thanks.'
  },
  {
    title: 'Not Interested',
    badge: 'Not Interested',
    color: '#94A3B8',
    text: 'We do not need digital marketing or website redesign services. Please pass on this.'
  },
  {
    title: 'Stop Contacting Me (Opt-out)',
    badge: 'Opt-out',
    color: '#D95757',
    text: 'Please unsubscribe our business and remove me from your list. Stop contacting us.'
  },
  {
    title: 'Unclear / Contradictory Reply',
    badge: 'Needs Review',
    color: '#D99A2B',
    text: 'Maybe yes maybe no, depends on whether our partner approves next week but also we might sell the firm.'
  }
];

export default function ReplyLabView({ backendUrl, leads, onRefresh }) {
  const [inputText, setInputText] = useState(PRESET_SCENARIOS[0].text);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [applyToLead, setApplyToLead] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [appliedNotice, setAppliedNotice] = useState('');

  // Separate genuine CRM leads from automated test fixtures
  const genuineLeads = (leads || []).filter(l => {
    if (l.is_test) return false;
    const name = (l.business_name || '').toLowerCase();
    const id = (l.id || '').toLowerCase();
    if (name.includes('test_') || name.includes('flow test') || name.includes('draft test')) return false;
    if (id.startsWith('lead_flow_') || id.startsWith('lead_chat_') || id.startsWith('lead_draft_')) return false;
    return true;
  });

  const testFixtureLeads = (leads || []).filter(l => {
    if (l.is_test) return true;
    const name = (l.business_name || '').toLowerCase();
    const id = (l.id || '').toLowerCase();
    return name.includes('test_') || name.includes('flow test') || name.includes('draft test') ||
           id.startsWith('lead_flow_') || id.startsWith('lead_chat_') || id.startsWith('lead_draft_');
  });

  const handleRunAnalysis = async (textToRun = inputText) => {
    setLoading(true);
    setResult(null);
    setAppliedNotice('');
    try {
      const res = await fetch(`${backendUrl}/api/crm/classify-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToRun,
          lead_id: selectedLeadId || undefined,
          apply_update: applyToLead
        })
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.classification);
        if (applyToLead && data.lead) {
          setAppliedNotice(`Updated "${data.tested_lead}": Stage transitioned to "${data.classification.predicted_stage}" and follow-up task scheduled.`);
          if (onRefresh) onRefresh();
        }
      } else {
        const err = await res.json();
        alert(err.error || "Analysis failed.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectScenario = (scenario) => {
    setInputText(scenario.text);
    handleRunAnalysis(scenario.text);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* Sandbox Header Banner */}
      <div style={sandboxBannerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#EDF3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FlaskConical size={20} color="var(--primary)" />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              AI Reply Classification Lab & Sandbox
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Test how Autopilot interprets intent, calculates future dates, updates CRM stages, and drafts follow-ups.
            </p>
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#FFF8E6', border: '1px solid #FFE4A0', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: '#B45309' }}>
          <Sparkles size={14} /> Sandbox Testing Mode (Safe Execution)
        </div>
      </div>

      {/* Preset Scenario Buttons */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
          Quick Test Scenarios:
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PRESET_SCENARIOS.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectScenario(s)}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderLeft: `3px solid ${s.color}`,
                backgroundColor: inputText === s.text ? 'var(--surface-soft)' : 'var(--surface)'
              }}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Input & Output */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px' }}>
        
        {/* Left: Input Console */}
        <div className="card-surface" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
            Input Customer Reply
          </h3>

          <textarea
            rows={6}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or paste any customer reply text here..."
            style={{ fontSize: '13px', lineHeight: 1.5 }}
          />

          {/* Optional Lead Selector & Apply Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'var(--page-background)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select CRM Lead to Test Against:
            </div>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              style={{ fontSize: '13px' }}
            >
              <optgroup label="Simulated Sandbox Practice">
                <option value="">Simulated Business (Apex Dental Clinic)</option>
              </optgroup>
              
              <optgroup label={`Genuine CRM Leads (${genuineLeads.length})`}>
                {genuineLeads.map((l) => {
                  const city = l.city || (l.address ? l.address.split(',')[1]?.trim() : '');
                  const meta = [l.category, city].filter(Boolean).join(', ');
                  return (
                    <option key={l.id} value={l.id}>
                      {l.business_name}{meta ? ` • ${meta}` : ''} — [{l.lifecycle_stage}]
                    </option>
                  );
                })}
              </optgroup>

              {testFixtureLeads.length > 0 && (
                <optgroup label={`Automated Test Fixtures (${testFixtureLeads.length})`}>
                  {testFixtureLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      [Test Fixture] {l.business_name} — [{l.lifecycle_stage}]
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {selectedLeadId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={applyToLead}
                  onChange={(e) => setApplyToLead(e.target.checked)}
                />
                Apply classification and update this genuine lead in CRM
              </label>
            )}

            {appliedNotice && (
              <div style={{ backgroundColor: '#EDFBF5', border: '1px solid #A3E6CD', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} />
                <span>{appliedNotice}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => handleRunAnalysis()}
            disabled={loading || !inputText.trim()}
            className="btn-primary"
            style={{ padding: '12px', fontSize: '14px', marginTop: 'auto' }}
          >
            {loading ? <RefreshCw size={16} className="spin-loader" /> : <Play size={16} />}
            Run Autopilot Analysis
          </button>
        </div>

        {/* Right: Autopilot Structured Output */}
        <div className="card-surface" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
            Autopilot Decision & Structured Output
          </h3>

          {!result ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Bot size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
              <div>Click "Run Autopilot Analysis" to inspect the classification output.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Classification Hero Result */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-soft)', padding: '14px 18px', borderRadius: '10px', border: '1px solid #D6E4FF' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                    Predicted Intent
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {result.primary_classification}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-blue" style={{ fontSize: '13px', padding: '4px 10px' }}>
                    {Math.round((result.confidence || 0.95) * 100)}% Confidence
                  </span>
                </div>
              </div>

              {/* Explanation */}
              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>EXPLANATION:</span>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px', lineHeight: 1.5 }}>
                  {result.explanation}
                </p>
              </div>

              {/* CRM Lifecycle Stage Transition */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={metricBoxStyle}>
                  <span style={labelStyle}>Proposed CRM Stage:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                    <ArrowRight size={14} color="var(--primary)" />
                    {result.proposed_stage}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <span style={labelStyle}>Follow-up Due Date:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                    <Calendar size={14} color="var(--primary)" />
                    {result.proposed_follow_up_date
                      ? new Date(result.proposed_follow_up_date).toLocaleDateString()
                      : 'None required'}
                  </div>
                </div>
              </div>

              {/* Recommended Action */}
              <div style={metricBoxStyle}>
                <span style={labelStyle}>Recommended Next Action:</span>
                <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {result.recommended_action}
                </div>
              </div>

              {/* Contextual Email Draft Generated */}
              {result.suggested_email_draft && (
                <div className="card-soft" style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
                    <Mail size={14} /> Autonomous Contextual Email Draft
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Subject: {result.suggested_email_draft.subject}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '6px', border: '1px solid #D6E4FF' }}>
                    {result.suggested_email_draft.body}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const sandboxBannerStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  padding: '16px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
};

const metricBoxStyle = {
  backgroundColor: 'var(--page-background)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '10px 14px',
};

const labelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};
