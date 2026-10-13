import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Phone,
  Globe,
  Calendar,
  Sparkles,
  Shield,
  ShieldAlert,
  Clock,
  Send,
  MessageSquare,
  FileText,
  Link,
  Copy,
  Check,
  ExternalLink,
  Laptop,
  Smartphone,
  RefreshCw,
  Gauge,
  AlertCircle,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  History,
  Lock,
  ChevronDown,
  ChevronUp,
  Eye,
  ShieldCheck,
  Layers,
  Zap
} from 'lucide-react';
import { useCurrency, formatCurrency } from '../utils/currencyFormatter';
import LeadScoreGauge from './LeadScoreGauge';

const EMAIL_SCENARIOS = [
  { id: 'initial_outreach', label: '1. Initial Outreach (Technical Audit Flaws)' },
  { id: 'follow_up', label: '2. Personalized Follow-up (Check-in)' },
  { id: 'interested_response', label: '3. Response to Interested Client (Scope & Next Steps)' },
  { id: 'meeting_request', label: '4. Meeting Request (Specific Timeslots)' },
  { id: 'pricing_followup', label: '5. Proposal & Pricing Options' },
  { id: 'delayed_reconnect', label: '6. Delayed Reconnect (Follow-up)' },
  { id: 're_engagement', label: '7. Re-engagement Touchpoint' }
];

const BUDGET_TYPES = [
  'Not discussed',
  'Estimated',
  'Client stated',
  'Client confirmed',
  'Negotiable'
];

const CONFIRMATION_SOURCES = [
  'Customer conversation',
  'Email',
  'Phone call',
  'Manual entry',
  'Other'
];

export default function LeadWorkspaceModal({ leadId, onClose, backendUrl, onLeadUpdated }) {
  const { currency: appCurrency } = useCurrency();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'email_draft' | 'conversations' | 'requirements' | 'audit' | 'timeline' | 'chat_link'
  
  // Note editing state
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  
  // Email Drafter state
  const [emailScenario, setEmailScenario] = useState('initial_outreach');
  const [customDraftPrompt, setCustomDraftPrompt] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState(null);
  const [draftFollowUpDate, setDraftFollowUpDate] = useState('');
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [draftAiMeta, setDraftAiMeta] = useState(null);

  // Gmail Draft integration state
  const [creatingGmailDraft, setCreatingGmailDraft] = useState(false);
  const [gmailDraftStatus, setGmailDraftStatus] = useState('idle'); // 'idle' | 'creating' | 'created' | 'failed'
  const [gmailDraftResult, setGmailDraftResult] = useState(null);
  const [gmailDraftError, setGmailDraftError] = useState('');

  // Client Scope & Requirements state
  const [reqBudgetAmount, setReqBudgetAmount] = useState('');
  const [reqCurrency, setReqCurrency] = useState(appCurrency || 'INR');
  const [reqBudgetType, setReqBudgetType] = useState('Not discussed');
  const [reqBudgetNotes, setReqBudgetNotes] = useState('');
  const [reqBudgetConfirmedAt, setReqBudgetConfirmedAt] = useState('');
  const [reqBudgetConfirmationSource, setReqBudgetConfirmationSource] = useState('Manual entry');
  const [reqBudgetIsConfirmed, setReqBudgetIsConfirmed] = useState(false);

  const [reqRequestedService, setReqRequestedService] = useState('');
  const [reqClientRequirements, setReqClientRequirements] = useState('');
  const [reqDeliverables, setReqDeliverables] = useState('');
  const [reqExpectedOutcome, setReqExpectedOutcome] = useState('');
  const [reqConstraints, setReqConstraints] = useState('');
  const [reqTimeline, setReqTimeline] = useState('Not stated');
  const [reqTimelineType, setReqTimelineType] = useState('Estimated');
  const [reqTimelineIsConfirmed, setReqTimelineIsConfirmed] = useState(false);
  const [reqTimelineConfirmedAt, setReqTimelineConfirmedAt] = useState('');
  const [reqDecisionMaker, setReqDecisionMaker] = useState('');
  const [reqDecisionMakerRole, setReqDecisionMakerRole] = useState('');
  const [reqKeyStakeholders, setReqKeyStakeholders] = useState('');
  const [reqScopeNotes, setReqScopeNotes] = useState('');
  
  const [reqsSaving, setReqsSaving] = useState(false);
  const [reqsSavedNotice, setReqsSavedNotice] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSourceSelect, setConfirmSourceSelect] = useState('Customer conversation');
  const [confirmReviewAgreed, setConfirmReviewAgreed] = useState(false);
  const [confirmingReqs, setConfirmingReqs] = useState(false);
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Private chat link state
  const [chatLink, setChatLink] = useState(null);
  const [chatLinkError, setChatLinkError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Website Audit state
  const [auditingWebsite, setAuditingWebsite] = useState(false);
  const [auditSubTab, setAuditSubTab] = useState('presence'); // 'presence' | 'screenshots' | 'mockup'
  const [auditActionError, setAuditActionError] = useState('');
  const [auditActionSuccess, setAuditActionSuccess] = useState('');

  // Populate requirements form state
  const initRequirementsFromLead = (data) => {
    const r = data.requirements || {};
    setReqBudgetAmount(r.budget_amount !== undefined && r.budget_amount !== null ? r.budget_amount : '');
    setReqCurrency(r.currency || appCurrency || 'INR');
    setReqBudgetType(r.budget_type || (r.budget && r.budget !== 'Not discussed' ? 'Client stated' : 'Not discussed'));
    setReqBudgetNotes(r.budget_notes || '');
    setReqBudgetConfirmedAt(r.budget_confirmed_at || '');
    setReqBudgetConfirmationSource(r.budget_confirmation_source || 'Manual entry');
    setReqBudgetIsConfirmed(Boolean(r.budget_is_confirmed));

    setReqRequestedService(r.requested_service || '');
    setReqClientRequirements(r.client_requirements || '');
    setReqDeliverables(Array.isArray(r.deliverables) ? r.deliverables.join(', ') : (r.deliverables || ''));
    setReqExpectedOutcome(r.expected_outcome || '');
    setReqConstraints(r.constraints || '');
    setReqTimeline(r.timeline || 'Not stated');
    setReqTimelineType(r.timeline_type || 'Estimated');
    setReqTimelineIsConfirmed(Boolean(r.timeline_is_confirmed));
    setReqTimelineConfirmedAt(r.timeline_confirmed_at || '');
    setReqDecisionMaker(r.decision_maker && r.decision_maker !== 'Unknown' ? r.decision_maker : '');
    setReqDecisionMakerRole(r.decision_maker_role || '');
    setReqKeyStakeholders(r.key_stakeholders || '');
    setReqScopeNotes(r.scope_notes || '');
    setChangeHistory(r.change_history || []);
  };

  // Load complete lead dossier
  const fetchLeadDetails = async (targetId = leadId) => {
    if (!targetId) return;
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${targetId}`);
      if (res.ok) {
        const data = await res.json();
        // Guard against race conditions: only update if still on this lead
        if (targetId === leadId) {
          setLead(data);
          setNotes(data.notes || '');
          initRequirementsFromLead(data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch lead details:", e);
    } finally {
      if (targetId === leadId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (leadId) {
      setLoading(true);
      fetchLeadDetails(leadId);
    }
  }, [leadId]);

  const handleUpdateStage = async (newStage) => {
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle_stage: newStage })
      });
      if (res.ok) {
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleOptOut = async () => {
    const isCurrentlyOptedOut = Boolean(lead.is_opted_out);
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_opted_out: !isCurrentlyOptedOut,
          lifecycle_stage: !isCurrentlyOptedOut ? 'Opted Out' : 'Contacted',
          opt_out_reason: !isCurrentlyOptedOut ? 'Manual salesperson toggle' : null
        })
      });
      if (res.ok) {
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      if (res.ok) {
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNotes(false);
    }
  };

  // --- Client Scope & Requirements Handlers ---
  const handleSaveRequirements = async () => {
    setReqsSaving(true);
    setReqsSavedNotice(null);
    try {
      const payload = {
        budget_amount: reqBudgetAmount !== '' ? parseFloat(reqBudgetAmount) : null,
        currency: reqCurrency,
        budget_type: reqBudgetType,
        budget_notes: reqBudgetNotes,
        budget_confirmation_source: reqBudgetConfirmationSource,
        budget_is_confirmed: reqBudgetType === 'Client confirmed',
        requested_service: reqRequestedService,
        client_requirements: reqClientRequirements,
        deliverables: reqDeliverables.split(',').map(s => s.trim()).filter(Boolean),
        expected_outcome: reqExpectedOutcome,
        constraints: reqConstraints,
        timeline: reqTimeline || 'Not stated',
        timeline_type: reqTimelineType,
        decision_maker: reqDecisionMaker || 'Unknown',
        decision_maker_role: reqDecisionMakerRole,
        key_stakeholders: reqKeyStakeholders,
        scope_notes: reqScopeNotes
      };

      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const saved = await res.json();
        setReqsSavedNotice('Requirements and scope updated successfully.');
        initRequirementsFromLead({ requirements: saved });
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
        setTimeout(() => setReqsSavedNotice(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReqsSaving(false);
    }
  };

  const handleConfirmRequirements = async () => {
    if (!confirmReviewAgreed) return;
    setConfirmingReqs(true);
    try {
      const payload = {
        confirm_budget: Boolean(reqBudgetAmount !== ''),
        confirm_timeline: Boolean(reqTimeline && reqTimeline !== 'Not stated'),
        confirmation_source: confirmSourceSelect,
        budget_amount: reqBudgetAmount !== '' ? parseFloat(reqBudgetAmount) : null,
        currency: reqCurrency,
        budget_type: 'Client confirmed',
        timeline: reqTimeline || 'Not stated',
        timeline_type: 'Client confirmed',
        requested_service: reqRequestedService,
        client_requirements: reqClientRequirements,
        deliverables: reqDeliverables.split(',').map(s => s.trim()).filter(Boolean),
        expected_outcome: reqExpectedOutcome,
        constraints: reqConstraints,
        decision_maker: reqDecisionMaker || 'Unknown',
        decision_maker_role: reqDecisionMakerRole,
        key_stakeholders: reqKeyStakeholders,
        scope_notes: reqScopeNotes
      };

      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/requirements/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setShowConfirmModal(false);
        setConfirmReviewAgreed(false);
        setReqsSavedNotice('✓ Requirements and scope marked as client-confirmed!');
        initRequirementsFromLead({ requirements: data.requirements });
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
        setTimeout(() => setReqsSavedNotice(null), 3500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmingReqs(false);
    }
  };

  // --- Email Drafting Handlers ---
  const handleGenerateDraft = async (scenarioOverride) => {
    setGeneratingDraft(true);
    setDraftSavedNotice(null);
    setGmailDraftStatus('idle');
    setGmailDraftResult(null);
    setGmailDraftError('');
    try {
      const scenario = scenarioOverride || emailScenario;
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/generate-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          custom_instructions: customDraftPrompt,
          recipient_name: recipientName || reqDecisionMaker
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDraftSubject(data.subject);
        setDraftBody(data.body);
        setDraftAiMeta(data);
      }
    } catch (e) {
      console.error('Draft error:', e);
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftBody.trim()) return;
    setSavingDraft(true);
    setDraftSavedNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/save-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: draftSubject,
          body: draftBody,
          scenario: emailScenario,
          create_task: Boolean(draftFollowUpDate),
          follow_up_date: draftFollowUpDate ? new Date(draftFollowUpDate).toISOString() : null
        })
      });
      if (res.ok) {
        setDraftSavedNotice('Draft saved to conversation history and scheduled follow-up tasks!');
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingDraft(false);
    }
  };

  const copyDraftToClipboard = () => {
    const fullText = `Subject: ${draftSubject}\n\n${draftBody}`;
    navigator.clipboard.writeText(fullText);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  // --- Gmail Draft Creation Handler ---
  const handleCreateGmailDraft = async () => {
    if (!draftBody.trim()) return;
    if (gmailDraftStatus === 'created' && gmailDraftResult) {
      if (!window.confirm("A Gmail Draft was already created for this session. Do you want to create an additional draft in Gmail?")) {
        return;
      }
    }
    setCreatingGmailDraft(true);
    setGmailDraftError('');
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/gmail-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: lead.email || '',
          subject: draftSubject,
          body: draftBody
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGmailDraftStatus('created');
        setGmailDraftResult(data);
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
      } else {
        setGmailDraftStatus('failed');
        setGmailDraftResult(data);
        setGmailDraftError(data.error || 'Failed to create Gmail draft. Ensure Google OAuth is connected in Settings.');
      }
    } catch (e) {
      setGmailDraftStatus('failed');
      setGmailDraftResult({ requires_reconnect: false });
      setGmailDraftError('Network connection failed while calling Gmail API.');
    } finally {
      setCreatingGmailDraft(false);
    }
  };

  // --- Customer Chat Link Handler ---
  const handleGenerateChatLink = async () => {
    setGeneratingLink(true);
    setChatLinkError('');
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/chat-link`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.chat_url) {
        setChatLink({ fullUrl: data.chat_url, token: data.token, expiresAt: data.expires_at });
      } else {
        setChatLinkError(data.error || 'PUBLIC_FRONTEND_URL is not configured in backend environment.');
      }
    } catch (e) {
      setChatLinkError('Network error connecting to backend.');
    } finally {
      setGeneratingLink(false);
    }
  };

  // --- Technical Website Audit Handler ---
  const handleRunWebsiteAudit = async () => {
    setAuditingWebsite(true);
    setAuditActionError('');
    setAuditActionSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}/audit`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuditActionSuccess(data.message || 'Website audit completed successfully.');
        fetchLeadDetails();
        if (onLeadUpdated) onLeadUpdated();
      } else {
        setAuditActionError(data.error || 'Failed to execute website audit.');
      }
    } catch (e) {
      setAuditActionError('Network connection failed while executing audit.');
    } finally {
      setAuditingWebsite(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading || !lead) {
    return (
      <div style={modalOverlayStyle}>
        <div className="card-surface" style={{ padding: '30px', borderRadius: '12px', textAlign: 'center' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--primary)' }} />
          <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>Loading lead workspace dossier...</p>
        </div>
      </div>
    );
  }

  const rawAudit = lead.audit_reports;
  const audit = (Array.isArray(rawAudit) ? rawAudit[0] : rawAudit) || {};
  const rawScore = lead.lead_scores;
  const score = (Array.isArray(rawScore) ? rawScore[0] : rawScore) || {};
  const reqs = lead.requirements || {};
  const activities = lead.activities || [];
  const messages = lead.messages || [];
  const contacts = audit.contacts || lead.contacts || {};
  const seo = audit.seo || {};
  const ux = audit.ux || {};
  const tech = audit.tech_detected || {};
  const screenshots = audit.screenshots || {};
  const socials = contacts.socialLinks || {};

  return (
    <div style={modalOverlayStyle}>
      <div className="card-surface" style={modalContentStyle}>
        
        {/* Modal Header */}
        <div style={modalHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {lead.business_name}
              </h2>
              <span className={`badge badge-score ${lead.lifecycle_stage === 'Won' ? 'badge-confirmed' : ''}`}>
                {lead.lifecycle_stage}
              </span>
              {reqBudgetIsConfirmed ? (
                <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} /> Confirmed Budget: {formatCurrency(reqBudgetAmount || 0, reqCurrency)}
                </span>
              ) : reqBudgetAmount ? (
                <span style={{ backgroundColor: '#E0F2FE', color: '#0369A1', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                  Est. Budget: {formatCurrency(reqBudgetAmount, reqCurrency)} ({reqBudgetType})
                </span>
              ) : null}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              {lead.category} • {lead.address}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`btn-secondary ${activeTab === 'audit' ? 'btn-active' : ''}`}
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="View Technical Website Audit Findings"
            >
              <ShieldCheck size={14} color="var(--primary)" />
              Audit
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('email_draft');
                if (!draftBody) handleGenerateDraft('initial_outreach');
              }}
              className={`btn-secondary ${activeTab === 'email_draft' ? 'btn-active' : ''}`}
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="Generate Personalized Email & Create Gmail Draft"
            >
              <Mail size={14} color="var(--primary)" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chat_link')}
              className={`btn-secondary ${activeTab === 'chat_link' ? 'btn-active' : ''}`}
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="Generate Secure Customer Chat Link"
            >
              <Link size={14} color="var(--primary)" />
              Chat Link
            </button>
            <button onClick={onClose} style={closeBtnStyle} title="Close Workspace">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={tabsBarStyle}>
          {[
            { id: 'overview', label: 'Overview & Profile' },
            { id: 'requirements', label: `Client Scope & Budget ${reqBudgetIsConfirmed ? '✓' : ''}` },
            { id: 'email_draft', label: '✉️ Email Drafter' },
            { id: 'conversations', label: `Conversations (${messages.length})` },
            { id: 'audit', label: 'Website Audit Findings' },
            { id: 'timeline', label: `Activity Timeline (${activities.length})` },
            { id: 'chat_link', label: 'Customer Chat Link' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'email_draft' && !draftBody) {
                  handleGenerateDraft('initial_outreach');
                }
              }}
              style={{
                ...tabHeaderButtonStyle,
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 700 : 500,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div style={modalBodyStyle}>
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="card-soft" style={{ padding: '16px', borderRadius: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Contact & Identification
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div><strong>Phone:</strong> {lead.phone || 'None detected'}</div>
                    <div><strong>Email:</strong> {lead.email || 'None detected'}</div>
                    <div>
                      <strong>Website:</strong>{' '}
                      {lead.website ? (
                        <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                          {lead.website} <ExternalLink size={12} style={{ display: 'inline' }} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>No Website</span>
                      )}
                    </div>
                    <div><strong>Google Star Rating:</strong> ⭐ {lead.google_rating || 0} ({lead.review_count || 0} reviews)</div>
                    <div><strong>Source:</strong> {lead.source || 'Prospect Scan'}</div>
                  </div>
                </div>

                {/* Scope & Budget Quick Snapshot */}
                <div className="card-surface" style={{ padding: '16px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                      Client Scope & Budget Snapshot
                    </h4>
                    <button
                      onClick={() => setActiveTab('requirements')}
                      className="btn-link"
                      style={{ fontSize: '12px', padding: 0 }}
                    >
                      Edit Scope →
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginTop: '6px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Budget: </span>
                      {reqBudgetIsConfirmed ? (
                        <strong style={{ color: '#065F46' }}>✓ {formatCurrency(reqBudgetAmount, reqCurrency)} (Confirmed)</strong>
                      ) : reqBudgetAmount ? (
                        <span>{formatCurrency(reqBudgetAmount, reqCurrency)} ({reqBudgetType})</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not stated</span>
                      )}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Timeline: </span>
                      <strong>{reqTimeline || 'Not stated'}</strong> ({reqTimelineType})
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Service: </span>
                      <strong>{reqRequestedService || 'General modernization'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Decision Maker: </span>
                      <strong>{reqDecisionMaker || 'Unknown'}</strong>
                    </div>
                  </div>
                </div>

                <div className="card-surface" style={{ padding: '16px', borderRadius: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Salesperson Notes
                  </h4>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter private sales notes, context, or meeting takeaways..."
                    style={{ fontSize: '13px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button onClick={handleSaveNotes} disabled={savingNotes} className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}>
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="card-surface" style={{ padding: '16px', borderRadius: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Lifecycle & Governance
                  </h4>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Current Stage:
                    </label>
                    <select
                      value={lead.lifecycle_stage}
                      onChange={(e) => handleUpdateStage(e.target.value)}
                    >
                      {[
                        'Discovered', 'Qualified', 'Outreach Ready', 'Contacted',
                        'Interested', 'Follow-up Later', 'Meeting Requested',
                        'Opportunity', 'Won', 'Lost', 'Opted Out'
                      ].map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Next Prescribed Action:
                    </label>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', backgroundColor: 'var(--page-background)', padding: '10px', borderRadius: '6px' }}>
                      {lead.next_action || 'Review lead and initiate contact'}
                    </div>
                  </div>

                  {lead.next_follow_up_date && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Scheduled Follow-up Date:
                      </label>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color="var(--primary)" />
                        {new Date(lead.next_follow_up_date).toLocaleString()}
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <button
                      onClick={handleToggleOptOut}
                      className={lead.is_opted_out ? 'btn-secondary' : 'btn-danger'}
                      style={{ width: '100%', fontSize: '13px' }}
                    >
                      {lead.is_opted_out ? 'Remove Opt-out Restriction' : 'Mark as Opted Out (Suppression)'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLIENT REQUIREMENTS & SCOPE (EDITABLE & FINALIZABLE) */}
          {activeTab === 'requirements' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Notice Banner */}
              {reqsSavedNotice && (
                <div style={{ backgroundColor: '#EDFBF5', color: '#065F46', border: '1px solid #A3E6CD', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={16} /> {reqsSavedNotice}
                </div>
              )}

              {/* Unstated budget prompt banner if no budget stated */}
              {(!reqBudgetAmount || reqBudgetType === 'Not discussed') && (
                <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <DollarSign size={20} color="#2563EB" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E40AF' }}>Client Budget Not Stated Yet</div>
                      <div style={{ fontSize: '12px', color: '#3B82F6' }}>The client has not committed to a budget range. Add discussing pricing to your next touchpoint.</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById('budget_amount_input');
                        if (el) el.focus();
                      }}
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Add Budget
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('email_draft');
                        setEmailScenario('pricing_followup');
                        handleGenerateDraft('pricing_followup');
                      }}
                      className="btn-primary"
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      Ask Client About Budget
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                
                {/* 1. BUDGET SECTION */}
                <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #D6E4FF', paddingBottom: '8px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={16} /> Budget & Commercials
                    </h4>
                    {reqBudgetIsConfirmed ? (
                      <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> Confirmed
                      </span>
                    ) : (
                      <span style={{ backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                        {reqBudgetType}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Budget Amount:
                      </label>
                      <input
                        id="budget_amount_input"
                        type="number"
                        placeholder="e.g. 3500"
                        value={reqBudgetAmount}
                        onChange={(e) => setReqBudgetAmount(e.target.value)}
                        style={{ fontWeight: 600 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Currency:
                      </label>
                      <select
                        value={reqCurrency}
                        onChange={(e) => setReqCurrency(e.target.value)}
                      >
                        {['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Budget Type:
                    </label>
                    <select
                      value={reqBudgetType}
                      onChange={(e) => setReqBudgetType(e.target.value)}
                    >
                      {BUDGET_TYPES.map(bt => (
                        <option key={bt} value={bt}>{bt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Confirmation Source:
                    </label>
                    <select
                      value={reqBudgetConfirmationSource}
                      onChange={(e) => setReqBudgetConfirmationSource(e.target.value)}
                    >
                      {CONFIRMATION_SOURCES.map(cs => (
                        <option key={cs} value={cs}>{cs}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Budget Notes & Context:
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Discussed $3,500 turnkey package; client requested 2 installments."
                      value={reqBudgetNotes}
                      onChange={(e) => setReqBudgetNotes(e.target.value)}
                      style={{ fontSize: '12px' }}
                    />
                  </div>

                  {reqBudgetConfirmedAt && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Last confirmed on: {new Date(reqBudgetConfirmedAt).toLocaleString()} ({reqBudgetConfirmationSource})
                    </div>
                  )}
                </div>

                {/* 2. PROJECT SCOPE SECTION */}
                <div className="card-surface" style={{ padding: '18px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={16} /> Scope & Requirements
                    </h4>
                    {reqTimelineIsConfirmed && (
                      <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                        Timeline Confirmed
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Requested Service or Project:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Modern Mobile-Friendly Website + Booking Widget"
                      value={reqRequestedService}
                      onChange={(e) => setReqRequestedService(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Client's Specific Requirements:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Fast mobile load times, HIPAA compliance, bilingual English/Spanish"
                      value={reqClientRequirements}
                      onChange={(e) => setReqClientRequirements(e.target.value)}
                      style={{ fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Deliverables (comma-separated):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Responsive Design, SSL Setup, Booking System, Google SEO"
                      value={reqDeliverables}
                      onChange={(e) => setReqDeliverables(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Requested Timeline:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 3 weeks, by end of month"
                        value={reqTimeline}
                        onChange={(e) => setReqTimeline(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Timeline Type:
                      </label>
                      <select
                        value={reqTimelineType}
                        onChange={(e) => setReqTimelineType(e.target.value)}
                      >
                        <option value="Estimated">Estimated</option>
                        <option value="Client confirmed">Client confirmed</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Decision Maker Name:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. Sarah Jenkins"
                        value={reqDecisionMaker}
                        onChange={(e) => setReqDecisionMaker(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Role / Title:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Owner, Managing Director"
                        value={reqDecisionMakerRole}
                        onChange={(e) => setReqDecisionMakerRole(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Constraints, Exclusions & Notes:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Must not modify existing domain DNS until Friday night."
                      value={reqConstraints}
                      onChange={(e) => setReqConstraints(e.target.value)}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* ACTION BAR */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <History size={14} />
                    {showHistory ? 'Hide Change History' : `View Change History (${changeHistory.length})`}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleSaveRequirements}
                    disabled={reqsSaving}
                    className="btn-secondary"
                    style={{ fontSize: '13px', padding: '8px 18px' }}
                  >
                    {reqsSaving ? 'Saving Changes...' : 'Save Changes'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    className="btn-primary"
                    style={{ fontSize: '13px', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle2 size={15} /> Mark as Confirmed...
                  </button>
                </div>
              </div>

              {/* CHANGE HISTORY AUDIT LOG */}
              {showHistory && (
                <div className="card-surface" style={{ padding: '16px', borderRadius: '10px', marginTop: '10px' }}>
                  <h5 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                    Audit Change History
                  </h5>
                  {changeHistory.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No historical edits recorded yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                      {changeHistory.slice().reverse().map((h, i) => (
                        <div key={i} style={{ borderLeft: '2px solid var(--primary)', paddingLeft: '10px', fontSize: '12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.summary}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {h.timestamp ? new Date(h.timestamp).toLocaleString() : ''} • by {h.user || 'salesperson'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* REVIEW & CONFIRMATION MODAL */}
              {showConfirmModal && (
                <div style={modalOverlayStyle}>
                  <div className="card-surface" style={{ width: '520px', maxWidth: '92vw', padding: '24px', borderRadius: '14px', boxShadow: 'var(--shadow-modal)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} color="#059669" /> Review & Confirm Client Scope
                      </h3>
                      <button onClick={() => setShowConfirmModal(false)} style={closeBtnStyle}><X size={18} /></button>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
                      Confirmation locks verified commercials into the pipeline. Please review the values below before marking them as confirmed.
                    </p>

                    <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', fontSize: '13px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Budget:</strong> {reqBudgetAmount ? `${reqCurrency} ${Number(reqBudgetAmount).toLocaleString()}` : 'Not stated'}</div>
                      <div><strong>Service:</strong> {reqRequestedService || 'Modern Web Overhaul'}</div>
                      <div><strong>Timeline:</strong> {reqTimeline || 'Not stated'}</div>
                      <div><strong>Decision Maker:</strong> {reqDecisionMaker || 'Unknown'} {reqDecisionMakerRole ? `(${reqDecisionMakerRole})` : ''}</div>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Confirmation Source:
                      </label>
                      <select
                        value={confirmSourceSelect}
                        onChange={(e) => setConfirmSourceSelect(e.target.value)}
                      >
                        {CONFIRMATION_SOURCES.map(cs => (
                          <option key={cs} value={cs}>{cs}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '20px' }}>
                      <input
                        id="review_agree_check"
                        type="checkbox"
                        checked={confirmReviewAgreed}
                        onChange={(e) => setConfirmReviewAgreed(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <label htmlFor="review_agree_check" style={{ fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.4 }}>
                        I have reviewed these details with the client and verified that the budget and scope are approved.
                      </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowConfirmModal(false)}
                        className="btn-secondary"
                        style={{ fontSize: '13px', padding: '8px 16px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmRequirements}
                        disabled={!confirmReviewAgreed || confirmingReqs}
                        className="btn-primary"
                        style={{ fontSize: '13px', padding: '8px 20px', backgroundColor: confirmReviewAgreed ? '#059669' : undefined }}
                      >
                        {confirmingReqs ? 'Confirming...' : 'Confirm Scope & Budget'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: EMAIL DRAFTER (WITH AI TRANSPARENCY & GMAIL DRAFT INTEGRATION) */}
          {activeTab === 'email_draft' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              <div style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid #D6E4FF', borderRadius: '10px', padding: '14px 18px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} /> Grounded Sales Email Engine & AI Drafter
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Drafts are constructed using verified website audit findings (SSL, speed, responsiveness) and client requirements.
                  Review and customize before saving or creating an official Gmail Draft.
                </p>
              </div>

              {/* Scenario & Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Email Outreach Scenario:
                  </label>
                  <select
                    value={emailScenario}
                    onChange={(e) => {
                      setEmailScenario(e.target.value);
                      handleGenerateDraft(e.target.value);
                    }}
                  >
                    {EMAIL_SCENARIOS.map((sc) => (
                      <option key={sc.id} value={sc.id}>{sc.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Recipient Contact Name (Optional):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Sarah Jenkins"
                    value={recipientName || reqDecisionMaker}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
              </div>

              {/* Custom focus instructions */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Custom Angle or Instructions (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Emphasize fast 2-week turnaround, focus on online booking"
                  value={customDraftPrompt}
                  onChange={(e) => setCustomDraftPrompt(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleGenerateDraft()}
                  disabled={generatingDraft}
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={13} style={{ animation: generatingDraft ? 'spin 1.2s linear infinite' : 'none' }} />
                  {generatingDraft ? 'Generating Draft...' : 'Regenerate Email Draft'}
                </button>

                {/* AI Provider Transparency Badge */}
                {draftAiMeta && (
                  <div>
                    {draftAiMeta.is_ai_generated ? (
                      <span style={{ backgroundColor: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={13} /> {draftAiMeta.source_label || 'AI-Generated (Gemini 1.5 Flash)'}
                      </span>
                    ) : draftAiMeta.fallback_used ? (
                      <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }} title={draftAiMeta.error_message}>
                        <AlertTriangle size={13} /> Template Fallback (Gemini call failed)
                      </span>
                    ) : (
                      <span style={{ backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }} title={draftAiMeta.note}>
                        <FileText size={13} /> {draftAiMeta.source_label || 'Grounded Template Engine (Local)'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Subject & Body */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Subject Line:
                  </label>
                  <input
                    type="text"
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    style={{ fontWeight: 600 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Email Body (Editable):
                  </label>
                  <textarea
                    rows={10}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    style={{ fontSize: '13px', lineHeight: 1.5, fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              {/* Action Buttons: Copy, Local Save, and CREATE GMAIL DRAFT */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'end', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Schedule Follow-up Date (Optional):
                  </label>
                  <input
                    type="datetime-local"
                    value={draftFollowUpDate}
                    onChange={(e) => setDraftFollowUpDate(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    onClick={copyDraftToClipboard}
                    className="btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedDraft ? <Check size={14} /> : <Copy size={14} />}
                    {copiedDraft ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    onClick={handleSaveDraft}
                    disabled={savingDraft || !draftBody}
                    className="btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '12px' }}
                  >
                    {savingDraft ? 'Saving...' : 'Save Local Draft'}
                  </button>

                  {/* Gmail Draft Creation Button */}
                  <button
                    onClick={handleCreateGmailDraft}
                    disabled={creatingGmailDraft || !draftBody}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: gmailDraftStatus === 'created' ? '#059669' : undefined }}
                  >
                    {creatingGmailDraft ? (
                      <>
                        <RefreshCw size={13} style={{ animation: 'spin 1.2s linear infinite' }} />
                        Creating Gmail Draft...
                      </>
                    ) : gmailDraftStatus === 'created' ? (
                      <>
                        <CheckCircle2 size={14} />
                        Gmail Draft Created ✓
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        Create Gmail Draft
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Gmail Draft Success Banner with Direct Link */}
              {gmailDraftStatus === 'created' && gmailDraftResult && (
                <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <CheckCircle2 size={20} color="#059669" style={{ marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#065F46' }}>
                        Gmail Draft Created Successfully
                      </div>
                      <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                        {gmailDraftResult.note || 'Draft placed into your connected Gmail Drafts folder. Email is NEVER sent automatically.'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <a
                      href={gmailDraftResult.draft_url || 'https://mail.google.com/mail/u/0/#drafts'}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 14px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <ExternalLink size={13} /> Open Draft in Gmail
                    </a>
                  </div>
                </div>
              )}

              {/* Gmail Draft Error Banner */}
              {gmailDraftError && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <AlertCircle size={18} color="#DC2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B' }}>Gmail Draft Creation Failed</div>
                      <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>{gmailDraftError}</div>
                    </div>
                  </div>
                  {gmailDraftResult?.requires_reconnect && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(`${backendUrl}/api/gmail/auth-url?return_url=/settings`);
                          const data = await res.json();
                          if (data.auth_url) {
                            window.location.href = data.auth_url;
                            return;
                          }
                        } catch (e) {
                          console.error("Failed to fetch auth url:", e);
                        }
                        window.location.href = `${backendUrl}/api/gmail/connect?return_url=/settings`;
                      }}
                      className="btn-primary"
                      style={{ fontSize: '12px', padding: '6px 14px', backgroundColor: '#DC2626', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Mail size={13} /> Reconnect Google Account
                    </button>
                  )}
                </div>
              )}

              {draftSavedNotice && (
                <div style={{ backgroundColor: '#EDFBF5', color: 'var(--success)', border: '1px solid #A3E6CD', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={16} /> {draftSavedNotice}
                </div>
              )}

              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                * Strict Safety Guarantee: Sales Pipeline Autopilot creates drafts directly inside your connected Gmail Drafts folder using Google OAuth 2.0 with minimum compose permissions. Emails are NEVER dispatched automatically; you review and click send manually in Gmail.
              </div>

            </div>
          )}

          {/* TAB 4: CONVERSATIONS */}
          {activeTab === 'conversations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No messages recorded yet. Record messages or drafts to view timeline.
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={{ backgroundColor: m.direction === 'outbound' ? '#EDF3FF' : '#FFFFFF', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: m.direction === 'outbound' ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '4px' }}>
                      <span>
                        {m.sender_name} ({m.channel} • {m.direction})
                        {m.status === 'draft' && <span style={{ marginLeft: '8px', color: '#D99A2B' }}>[Local Draft]</span>}
                        {m.status === 'gmail_draft_created' && (
                          <span style={{ marginLeft: '8px', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> [Gmail Draft Created]
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}
                      </span>
                    </div>
                    {m.metadata?.subject && (
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Subject: {m.metadata.subject}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </div>
                    {m.metadata?.draft_url && (
                      <div style={{ marginTop: '8px' }}>
                        <a
                          href={m.metadata.draft_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <ExternalLink size={12} /> Open in Gmail Drafts
                        </a>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: WEBSITE AUDIT */}
          {activeTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Audit Top Dossier Banner */}
              <div style={{
                backgroundColor: 'var(--surface-soft)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <LeadScoreGauge
                    score={score.score ?? lead.lead_score}
                    priority={score.priority || lead.priority}
                    size="medium"
                    loading={auditingWebsite}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`badge-priority ${(score.priority || 'MEDIUM').toLowerCase()}`} style={{ fontSize: '11px', padding: '4px 10px' }}>
                        {score.priority || 'MEDIUM'} OPPORTUNITY
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: lead.website ? '#EDFBF5' : '#FEECEB',
                        color: lead.website ? 'var(--success)' : 'var(--danger)',
                        border: `1px solid ${lead.website ? '#A3E6CD' : '#FCA5A5'}`
                      }}>
                        {lead.website ? "Website Available" : "No Website"}
                      </span>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '13px' }}>
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                        >
                          {lead.website} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No live website registered on Google Maps</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleRunWebsiteAudit}
                    disabled={auditingWebsite || !lead.website}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={!lead.website ? "Cannot audit lead without a website" : "Re-run Playwright website audit"}
                  >
                    <RefreshCw size={14} className={auditingWebsite ? 'spin-loader' : ''} />
                    {auditingWebsite ? 'Auditing Website...' : 'Re-run Website Audit'}
                  </button>
                </div>
              </div>

              {/* Action Error / Success Banners */}
              {auditActionError && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={15} />
                  <span>{auditActionError}</span>
                </div>
              )}
              {auditActionSuccess && (
                <div style={{ backgroundColor: '#EDFBF5', border: '1px solid #A3E6CD', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={15} />
                  <span>{auditActionSuccess}</span>
                </div>
              )}

              {/* Subtabs Selector */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setAuditSubTab('presence')}
                  className={auditSubTab === 'presence' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Presence & Technical Dossier
                </button>
                <button
                  type="button"
                  onClick={() => setAuditSubTab('screenshots')}
                  className={auditSubTab === 'screenshots' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                  disabled={!lead.website}
                >
                  <Laptop size={13} />
                  Playwright Screenshots
                </button>
                <button
                  type="button"
                  onClick={() => setAuditSubTab('mockup')}
                  className={auditSubTab === 'mockup' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Sparkles size={13} />
                  Visual Redesign Mockup
                </button>
              </div>

              {/* SUBTAB 1: PRESENCE & TECHNICAL DOSSIER */}
              {auditSubTab === 'presence' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Performance & Security 4-Card Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                    <div className="card-soft" style={{ padding: '12px 14px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {audit.is_https ? <ShieldCheck size={14} color="var(--success)" /> : <ShieldAlert size={14} color="var(--danger)" />}
                        SSL Security
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px', color: audit.is_https ? 'var(--success)' : 'var(--danger)' }}>
                        {audit.is_https ? 'HTTPS Secured' : 'HTTP Insecure'}
                      </div>
                    </div>

                    <div className="card-soft" style={{ padding: '12px 14px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <Gauge size={14} color={audit.response_time_ms > 3000 ? 'var(--danger)' : 'var(--primary)'} />
                        Page Response Time
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>
                        {audit.response_time_ms ? `${audit.response_time_ms} ms` : (lead.website ? 'Under 1s' : 'N/A')}
                      </div>
                    </div>

                    <div className="card-soft" style={{ padding: '12px 14px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <Smartphone size={14} color={ux.isMobileFriendly ? 'var(--success)' : 'var(--danger)'} />
                        Mobile Viewport
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px', color: ux.isMobileFriendly ? 'var(--success)' : 'var(--danger)' }}>
                        {ux.isMobileFriendly ? 'Responsive' : 'Non-responsive'}
                      </div>
                    </div>

                    <div className="card-soft" style={{ padding: '12px 14px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <Sparkles size={14} color="var(--warning)" />
                        Google Rating
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>
                        {lead.google_rating ? `⭐ ${lead.google_rating}/5.0` : 'Not Rated'}
                      </div>
                    </div>
                  </div>

                  {/* SEO Findings Card */}
                  <div className="card-soft" style={{ padding: '16px', borderRadius: '10px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Search Engine Optimization (SEO) Findings
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>SEO Title:</strong>{' '}
                        <span style={{ color: seo.title ? 'var(--text-primary)' : 'var(--danger)', fontWeight: seo.title ? 500 : 700 }}>
                          {seo.title || '[Missing SEO Title Tag - Organic Search Flaw]'}
                        </span>
                      </div>
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>Meta Description:</strong>{' '}
                        <span style={{ color: seo.description ? 'var(--text-primary)' : 'var(--danger)', fontWeight: seo.description ? 500 : 700 }}>
                          {seo.description || '[Missing Meta Description - Poor CTR on Google]'}
                        </span>
                      </div>
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>H1 Hierarchy:</strong>{' '}
                        <span style={{ color: seo.h1Hierarchy?.length ? 'var(--text-primary)' : 'var(--warning)' }}>
                          {seo.h1Hierarchy?.length ? seo.h1Hierarchy.join(" | ") : '[No H1 Headers Found]'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Crawler Assets: {seo.hasRobotsTxt ? 'robots.txt Detected ✓' : 'robots.txt Missing ✗'} • {seo.hasSitemap ? 'sitemap.xml Detected ✓' : 'sitemap.xml Missing ✗'}
                      </div>
                    </div>
                  </div>

                  {/* Technologies & Features Detected */}
                  <div className="card-soft" style={{ padding: '16px', borderRadius: '10px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Technology Stack & Integrations Detected
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                      {Object.keys(tech).length > 0 ? (
                        Object.entries(tech).map(([k, val]) => (
                          <div
                            key={k}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              backgroundColor: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              fontSize: '12px'
                            }}
                          >
                            <span style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor: val ? 'var(--success)' : 'var(--text-muted)'
                            }} />
                            <span style={{ textTransform: 'capitalize' }}>
                              {k.replace(/([A-Z])/g, ' $1').trim()}:
                            </span>
                            <span style={{ fontWeight: 600, color: val ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {val ? 'Yes' : 'No'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          No custom booking widgets, WhatsApp, or tracking scripts detected.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Discovered Contact Channels */}
                  <div className="card-soft" style={{ padding: '16px', borderRadius: '10px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Discovered Contact Channels
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12px' }}>
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>Phone:</strong>{' '}
                        <span>{lead.phone || lead.phone_number || 'No phone registered'}</span>
                      </div>
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>Email:</strong>{' '}
                        <span>{lead.email || (contacts.emails?.length ? contacts.emails.join(', ') : 'None discovered on homepage')}</span>
                      </div>
                      {socials.linkedin && (
                        <div>
                          <strong style={{ color: 'var(--text-secondary)' }}>LinkedIn:</strong>{' '}
                          <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                            View Company Profile <ExternalLink size={10} />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Deficiencies Checklist & Recommended Services */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div className="card-soft" style={{ padding: '14px', borderRadius: '10px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--danger)', textTransform: 'uppercase' }}>
                        Opportunity Deficiencies
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                        {score.failed_checks?.map((chk) => (
                          <div key={chk} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--danger)' }} />
                            <span>{chk}</span>
                          </div>
                        ))}
                        {(!score.failed_checks || score.failed_checks.length === 0) && (
                          <div style={{ color: 'var(--success)' }}>✓ High performance baseline detected.</div>
                        )}
                      </div>
                    </div>

                    <div className="card-soft" style={{ padding: '14px', borderRadius: '10px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--primary)', textTransform: 'uppercase' }}>
                        Recommended Pitches
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {score.recommended_services?.map((svc) => (
                          <span
                            key={svc}
                            style={{
                              backgroundColor: '#EDF3FF',
                              color: 'var(--primary)',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #C7D2FE'
                            }}
                          >
                            {svc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* SUBTAB 2: PLAYWRIGHT SCREENSHOTS */}
              {auditSubTab === 'screenshots' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {screenshots.desktopUrl || screenshots.mobileUrl ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                      
                      {/* Desktop Capture */}
                      <div className="card-soft" style={{ padding: '14px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
                          <Laptop size={14} color="var(--primary)" />
                          Desktop Web Capture (1280 × 800)
                        </div>
                        {screenshots.desktopUrl ? (
                          <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <img
                              src={`${backendUrl}${screenshots.desktopUrl}`}
                              alt="Desktop Website View"
                              style={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                          </div>
                        ) : (
                          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No desktop screenshot captured.
                          </div>
                        )}
                      </div>

                      {/* Mobile Capture */}
                      <div className="card-soft" style={{ padding: '14px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
                          <Smartphone size={14} color="var(--primary)" />
                          Mobile Responsive Capture (375 × 812)
                        </div>
                        {screenshots.mobileUrl ? (
                          <div style={{ maxWidth: '260px', margin: '0 auto', borderRadius: '18px', border: '4px solid #1E293B', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                            <img
                              src={`${backendUrl}${screenshots.mobileUrl}`}
                              alt="Mobile Website View"
                              style={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                          </div>
                        ) : (
                          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No mobile screenshot captured.
                          </div>
                        )}
                      </div>

                    </div>
                  ) : (
                    <div className="card-soft" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: '10px' }}>
                      <Laptop size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        No Screenshots Available Yet
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '6px auto 16px auto' }}>
                        Click <strong>Re-run Website Audit</strong> above to launch Playwright headless automation, render the prospect's page, and capture high-resolution desktop and mobile previews.
                      </p>
                      <button
                        onClick={handleRunWebsiteAudit}
                        disabled={auditingWebsite || !lead.website}
                        className="btn-primary"
                        style={{ padding: '8px 18px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <RefreshCw size={13} className={auditingWebsite ? 'spin-loader' : ''} />
                        Run Audit Now
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 3: VISUAL REDESIGN MOCKUP */}
              {auditSubTab === 'mockup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Proposed Modern Redesign Card */}
                  <div className="card-soft" style={{ padding: '20px', borderRadius: '12px', border: '1px solid #C7D2FE', backgroundColor: '#F8FAFF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={16} color="var(--primary)" />
                          <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--primary)' }}>
                            Modernized Redesign Preview Concept
                          </h4>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          Tailored transformation proposal addressing {lead.business_name}'s audit deficiencies.
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setActiveTab('email_draft');
                          if (!draftBody) handleGenerateDraft('initial_outreach');
                        }}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Mail size={13} /> Pitch This Redesign
                      </button>
                    </div>

                    {/* Mockup Wireframe Preview Box */}
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '20px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
                    }}>
                      {/* Mock Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px', marginBottom: '16px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                          {lead.business_name}
                        </div>
                        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <span>Services</span>
                          <span>About Us</span>
                          <span>Testimonials</span>
                          <span style={{ backgroundColor: 'var(--primary)', color: '#FFF', padding: '3px 10px', borderRadius: '6px', fontWeight: 600 }}>
                            Book Online
                          </span>
                        </div>
                      </div>

                      {/* Mock Hero Section */}
                      <div style={{
                        background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                        padding: '24px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        marginBottom: '16px'
                      }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                          Trusted {lead.category || 'Professional Services'} in {lead.city || 'Your Area'}
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 auto 14px auto', maxWidth: '380px' }}>
                          Delivering world-class care and modern digital experiences. Seamless instant scheduling now available online.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                          <button style={{ backgroundColor: 'var(--primary)', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                            Schedule Consultation
                          </button>
                          <button style={{ backgroundColor: '#25D366', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                            WhatsApp Us
                          </button>
                        </div>
                      </div>

                      {/* Flaw Fix Callouts Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px' }}>
                        <div style={{ backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                          <strong style={{ color: 'var(--success)' }}>✓ 256-bit SSL Protected:</strong>
                          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>Zero security warnings on Chrome & Safari</div>
                        </div>
                        <div style={{ backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                          <strong style={{ color: 'var(--success)' }}>✓ 100% Mobile Optimized:</strong>
                          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>Sub-1.2s speed on 4G / 5G mobile devices</div>
                        </div>
                        <div style={{ backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                          <strong style={{ color: 'var(--success)' }}>✓ Direct Lead Capture:</strong>
                          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>Auto-sync appointments to calendar</div>
                        </div>
                      </div>
                    </div>

                    {/* Transparent Dependency & Architecture Note */}
                    <div style={{
                      marginTop: '14px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4
                    }}>
                      <strong>Architecture Transparency:</strong> Technical audit findings and screenshots are captured deterministically using Playwright headless browser rendering. High-fidelity generative mockup rendering operates with active template previews; custom AI image generation (e.g. Imagen / DALL-E) can be plugged in via environment settings without altering core lead intelligence.
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB 6: ACTIVITY TIMELINE */}
          {activeTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No sales activities recorded yet.
                </div>
              ) : (
                activities.map((act) => (
                  <div key={act.id} style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '14px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {act.description}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {act.performed_by} • {act.created_at ? new Date(act.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 7: CUSTOMER CHAT LINK */}
          {activeTab === 'chat_link' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-soft" style={{ padding: '16px', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--primary)' }}>
                  Secure Client Chat Access (Private Token Link)
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                  Generate a cryptographically secure, 256-bit entropy private link to send to the client. The client can ask questions about pricing, scopes, and timelines directly with the grounded AI assistant without leaking internal CRM data.
                </p>
              </div>

              {chatLinkError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#FEECEB',
                  color: 'var(--danger)',
                  border: '1px solid #FCA5A5',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '13px'
                }}>
                  <AlertCircle size={16} />
                  <span>{chatLinkError}</span>
                </div>
              )}

              {!chatLink ? (
                <div>
                  <button
                    onClick={handleGenerateChatLink}
                    disabled={generatingLink}
                    className="btn-primary"
                    style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    {generatingLink ? <RefreshCw size={15} style={{ animation: 'spin 1.2s linear infinite' }} /> : <Link size={15} />}
                    Generate Secure Private Chat Link
                  </button>
                </div>
              ) : (
                <div className="card-surface" style={{ padding: '18px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Active Client Link (Valid 7 Days):
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={chatLink.fullUrl}
                      style={{ fontSize: '13px', fontFamily: 'monospace', backgroundColor: 'var(--page-background)' }}
                    />
                    <button
                      onClick={() => copyToClipboard(chatLink.fullUrl)}
                      className="btn-primary"
                      style={{ padding: '0 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                      {copiedLink ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    <a
                      href={chatLink.fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ textDecoration: 'none', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <ExternalLink size={14} /> Open Customer Chat Preview
                    </a>
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

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(21, 34, 56, 0.45)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: '20px',
};

const modalContentStyle = {
  width: '940px',
  maxWidth: '96vw',
  maxHeight: '94vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: 'var(--shadow-modal)',
  borderRadius: '16px',
};

const modalHeaderStyle = {
  padding: '20px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  borderBottom: '1px solid var(--border)',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '6px',
  borderRadius: '6px',
};

const tabsBarStyle = {
  display: 'flex',
  gap: '12px',
  padding: '0 24px',
  borderBottom: '1px solid var(--border)',
  backgroundColor: 'var(--surface-soft)',
  overflowX: 'auto',
};

const tabHeaderButtonStyle = {
  padding: '12px 6px',
  background: 'none',
  border: 'none',
  fontSize: '13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const modalBodyStyle = {
  padding: '24px',
  overflowY: 'auto',
  flex: 1,
};
