import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Mail,
  Send,
  Sparkles,
  Bot,
  User,
  Clock,
  ShieldAlert,
  FileText,
  CheckCircle,
  PlusCircle,
  RefreshCw
} from 'lucide-react';

export default function ConversationsView({ leads, selectedLeadId, onSelectLead, backendUrl, onRefresh }) {
  const [activeLead, setActiveLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  // Composer mode: 'email' | 'record_reply' | 'note'
  const [composeMode, setComposeMode] = useState('record_reply');
  const [inputText, setInputText] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastClassification, setLastClassification] = useState(null);

  // Set active lead
  useEffect(() => {
    if (selectedLeadId) {
      const match = leads.find((l) => l.id === selectedLeadId);
      if (match) setActiveLead(match);
    } else if (leads.length > 0 && !activeLead) {
      setActiveLead(leads[0]);
    }
  }, [selectedLeadId, leads]);

  // Load messages whenever activeLead changes
  const loadMessages = async () => {
    if (!activeLead) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(`${backendUrl}/api/crm/leads/${activeLead.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadMessages();
    setLastClassification(null);
  }, [activeLead]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeLead) return;
    setSubmitting(true);

    try {
      if (composeMode === 'record_reply') {
        // Record incoming reply and auto-classify
        const res = await fetch(`${backendUrl}/api/crm/leads/${activeLead.id}/record-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: inputText.trim(),
            channel: 'email',
            sender_name: activeLead.business_name,
            sender_email: activeLead.email
          })
        });
        if (res.ok) {
          const result = await res.json();
          setLastClassification(result.classification);
          setInputText('');
          loadMessages();
          if (onRefresh) onRefresh();
        } else {
          const err = await res.json();
          alert(err.error || "Failed to record customer reply.");
        }
      } else if (composeMode === 'email') {
        // Send outbound email
        const res = await fetch(`${backendUrl}/api/crm/leads/${activeLead.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: inputText.trim(),
            channel: 'email',
            direction: 'outbound',
            sender_type: 'salesperson',
            metadata: { subject: emailSubject || 'Follow-up regarding digital growth' }
          })
        });
        if (res.ok) {
          setInputText('');
          setEmailSubject('');
          loadMessages();
          if (onRefresh) onRefresh();
        } else {
          const err = await res.json();
          alert(err.error || "Failed to record outbound email.");
        }
      } else if (composeMode === 'note') {
        // Record internal note
        const res = await fetch(`${backendUrl}/api/crm/leads/${activeLead.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: inputText.trim(),
            channel: 'internal_note',
            direction: 'internal',
            sender_type: 'salesperson',
            sender_name: 'Internal Note'
          })
        });
        if (res.ok) {
          setInputText('');
          loadMessages();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', height: 'calc(100vh - 110px)', display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
      
      {/* Left Column: Leads Thread List */}
      <div className="card-surface" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Conversations Inbox</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Unified communication timeline across channels
          </p>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {leads.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No CRM leads found. Save leads from discovery first.
            </div>
          ) : (
            leads.map((l) => {
              const isSelected = activeLead?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => setActiveLead(l)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--surface-soft)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div style={{ fontSize: '14px', fontWeight: isSelected ? 700 : 600, color: 'var(--text-primary)' }}>
                      {l.business_name}
                    </div>
                    {l.is_opted_out ? (
                      <span className="badge badge-red" style={{ fontSize: '10px' }}>Opted Out</span>
                    ) : (
                      <span className="badge badge-blue" style={{ fontSize: '10px' }}>{l.lifecycle_stage}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.next_action || l.category}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Unified Message Stream & Autopilot Composer */}
      <div className="card-surface" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        
        {/* Thread Header */}
        {activeLead ? (
          <div style={threadHeaderStyle}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
                  {activeLead.business_name}
                </h3>
                {activeLead.is_opted_out && (
                  <span className="badge badge-red">
                    <ShieldAlert size={12} /> Suppression Active
                  </span>
                )}
                {activeLead.latest_reply_classification && activeLead.latest_reply_classification !== 'None' && (
                  <span className="badge badge-blue">
                    Intent: {activeLead.latest_reply_classification}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Stage: <strong>{activeLead.lifecycle_stage}</strong> • {activeLead.phone || activeLead.email || 'No direct phone'}
              </p>
            </div>

            <button onClick={loadMessages} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              <RefreshCw size={13} className={loadingMessages ? 'spin-loader' : ''} /> Reload
            </button>
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Select a lead on the left to inspect conversation history.
          </div>
        )}

        {/* Message Stream */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: 'var(--page-background)' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <Mail size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <div>No messages recorded yet for this lead.</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                Use the composer below to record an outreach email, customer reply, or internal note.
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isOutbound = m.direction === 'outbound';
              const isInternal = m.direction === 'internal' || m.channel === 'internal_note';
              const isChat = m.channel === 'chat';

              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isOutbound ? 'flex-end' : isInternal ? 'center' : 'flex-start',
                    maxWidth: isInternal ? '90%' : '75%',
                    backgroundColor: isInternal ? '#FFF8E6' : isOutbound ? '#EDF3FF' : '#FFFFFF',
                    border: isInternal ? '1px solid #FFE4A0' : isOutbound ? '1px solid #D6E4FF' : '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: isOutbound ? 'var(--primary)' : isInternal ? '#B45309' : 'var(--text-primary)' }}>
                      {isInternal ? <FileText size={13} /> : isChat ? <Bot size={13} /> : <Mail size={13} />}
                      <span>{m.sender_name || (isOutbound ? 'Sales Team' : 'Customer')}</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase' }}>
                        ({m.channel} • {m.direction})
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  {m.metadata?.subject && (
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                      Subject: {m.metadata.subject}
                    </div>
                  )}

                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                </div>
              );
            })
          )}

          {/* Autopilot Real-time Feedback Banner */}
          {lastClassification && (
            <div style={aiFeedbackBannerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)' }}>
                  Autopilot Classified Reply: {lastClassification.primary_classification}
                </span>
                <span className="badge badge-blue">
                  {Math.round((lastClassification.confidence || 0.95) * 100)}% Confidence
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0 0 0' }}>
                {lastClassification.explanation}
              </p>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '4px', fontWeight: 600 }}>
                Next Action: {lastClassification.recommended_action}
              </div>
            </div>
          )}
        </div>

        {/* Composer Bar */}
        {activeLead && (
          <div style={composerContainerStyle}>
            {/* Mode Selector Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setComposeMode('record_reply')}
                style={{
                  ...tabBtnStyle,
                  backgroundColor: composeMode === 'record_reply' ? '#EDF3FF' : 'transparent',
                  color: composeMode === 'record_reply' ? 'var(--primary)' : 'var(--text-secondary)',
                  border: composeMode === 'record_reply' ? '1px solid #D1E1FF' : '1px solid transparent',
                  fontWeight: 600
                }}
              >
                <Sparkles size={14} /> Record Customer Reply (Auto-Classify & Advance CRM)
              </button>

              <button
                type="button"
                onClick={() => setComposeMode('email')}
                style={{
                  ...tabBtnStyle,
                  backgroundColor: composeMode === 'email' ? '#EDF3FF' : 'transparent',
                  color: composeMode === 'email' ? 'var(--primary)' : 'var(--text-secondary)',
                  border: composeMode === 'email' ? '1px solid #D1E1FF' : '1px solid transparent',
                  fontWeight: 600
                }}
              >
                <Mail size={14} /> Send Outbound Email
              </button>

              <button
                type="button"
                onClick={() => setComposeMode('note')}
                style={{
                  ...tabBtnStyle,
                  backgroundColor: composeMode === 'note' ? '#FFF8E6' : 'transparent',
                  color: composeMode === 'note' ? '#B45309' : 'var(--text-secondary)',
                  border: composeMode === 'note' ? '1px solid #FFE4A0' : '1px solid transparent',
                  fontWeight: 600
                }}
              >
                <FileText size={14} /> Internal Note
              </button>
            </div>

            <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {composeMode === 'email' && (
                <input
                  type="text"
                  placeholder="Email Subject..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  style={{ fontSize: '13px', padding: '8px 12px' }}
                />
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <textarea
                  rows={2}
                  placeholder={
                    composeMode === 'record_reply'
                      ? "Paste customer reply here (e.g., 'We are interested', 'Contact in 5 months', or 'Unsubscribe')..."
                      : composeMode === 'email'
                      ? "Compose outbound sales message..."
                      : "Type internal notes for the sales team..."
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  style={{ flex: 1, resize: 'none', padding: '10px 12px', fontSize: '13px' }}
                />
                <button
                  type="submit"
                  disabled={submitting || !inputText.trim() || (activeLead?.is_opted_out && composeMode === 'email')}
                  className="btn-primary"
                  style={{ alignSelf: 'flex-end', height: '42px', padding: '0 18px' }}
                >
                  {submitting ? (
                    <RefreshCw size={15} className="spin-loader" />
                  ) : composeMode === 'record_reply' ? (
                    <>
                      <Sparkles size={15} /> Record & Classify
                    </>
                  ) : (
                    <>
                      <Send size={15} /> Send
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}

const threadHeaderStyle = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const aiFeedbackBannerStyle = {
  backgroundColor: '#EDF3FF',
  border: '1px solid #C5D8FC',
  borderRadius: '10px',
  padding: '12px 16px',
  alignSelf: 'stretch',
  boxShadow: 'var(--shadow-sm)',
};

const composerContainerStyle = {
  padding: '14px 18px',
  borderTop: '1px solid var(--border)',
  backgroundColor: 'var(--surface)',
};

const tabBtnStyle = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};
