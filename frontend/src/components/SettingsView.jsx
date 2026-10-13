import React, { useState, useEffect } from 'react';
import {
  Settings,
  ShieldCheck,
  Database,
  Key,
  Server,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Users,
  GitMerge,
  Eye,
  CheckCircle2,
  Mail,
  Globe,
  Sparkles,
  ExternalLink,
  Shield,
  Unlink,
  HelpCircle,
  Coins
} from 'lucide-react';
import { useCurrency, SUPPORTED_CURRENCIES, formatCurrency } from '../utils/currencyFormatter';

export default function SettingsView({ apiStatus, isDemoMode, backendUrl, onRefresh }) {
  // Application Currency settings
  const { currency: appCurrency, setCurrency: setAppCurrency } = useCurrency();

  // Duplicate scanner state
  const [scanningDups, setScanningDups] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState(null);
  const [scanMessage, setScanMessage] = useState(null);
  
  // Merge action state
  const [mergingGroupId, setMergingGroupId] = useState(null);
  const [dryRunPreview, setDryRunPreview] = useState(null);
  const [mergeResultNotice, setMergeResultNotice] = useState(null);

  // Gmail connection state
  const [gmailStatus, setGmailStatus] = useState(apiStatus?.gmail || null);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [disconnectingGmail, setDisconnectingGmail] = useState(false);
  const [gmailNotice, setGmailNotice] = useState(null);

  // Fetch live Gmail and AI status
  const fetchProviderStatuses = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/api-status`);
      if (res.ok) {
        const data = await res.json();
        if (data.gmail) setGmailStatus(data.gmail);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Check URL parameters for OAuth return notifications
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected')) {
      setGmailNotice({ type: 'success', text: 'Google OAuth authorization successful! Gmail draft creation is now active.' });
      fetchProviderStatuses();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('gmail_error')) {
      setGmailNotice({ type: 'error', text: `Gmail OAuth authorization failed: ${params.get('gmail_error')}` });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    setGmailNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/gmail/auth-url?return_url=/settings`);
      const data = await res.json();
      if (res.ok && data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        setGmailNotice({
          type: 'error',
          text: data.error || 'Google OAuth credentials missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.'
        });
      }
    } catch (e) {
      setGmailNotice({ type: 'error', text: 'Network connection failed while initiating Gmail OAuth.' });
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm("Disconnect your Gmail account from Sales Pipeline Autopilot?")) return;
    setDisconnectingGmail(true);
    try {
      const res = await fetch(`${backendUrl}/api/gmail/disconnect`, { method: 'POST' });
      if (res.ok) {
        setGmailNotice({ type: 'info', text: 'Gmail account disconnected successfully.' });
        fetchProviderStatuses();
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDisconnectingGmail(false);
    }
  };

  // Scan duplicates
  const handleScanDuplicates = async () => {
    setScanningDups(true);
    setScanMessage(null);
    setDryRunPreview(null);
    setMergeResultNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/crm/duplicates/scan`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateGroups(data.groups || []);
        if (data.groups_count === 0) {
          setScanMessage({ type: 'success', text: 'Clean CRM! No candidate duplicate groups detected.' });
        } else {
          setScanMessage({
            type: 'info',
            text: `Detected ${data.groups_count} candidate duplicate group(s) with matching domains, phones, or names.`
          });
        }
      } else {
        setScanMessage({ type: 'error', text: 'Failed to scan for duplicate leads.' });
      }
    } catch (e) {
      setScanMessage({ type: 'error', text: 'Network error connecting to backend.' });
    } finally {
      setScanningDups(false);
    }
  };

  // Preview / Dry Run merge
  const handleDryRunMerge = async (group) => {
    setMergingGroupId(group.surviving_id);
    try {
      const res = await fetch(`${backendUrl}/api/crm/duplicates/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surviving_id: group.surviving_id,
          duplicate_ids: group.duplicate_ids,
          dry_run: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDryRunPreview({ groupId: group.surviving_id, ...data });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMergingGroupId(null);
    }
  };

  // Execute safe merge
  const handleExecuteMerge = async (group) => {
    if (!window.confirm(`Merge duplicate records into '${group.surviving_lead?.business_name}'? Related messages, tasks, and notes will be reassigned.`)) {
      return;
    }

    setMergingGroupId(group.surviving_id);
    setMergeResultNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/crm/duplicates/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surviving_id: group.surviving_id,
          duplicate_ids: group.duplicate_ids,
          dry_run: false
        })
      });
      if (res.ok) {
        const result = await res.json();
        setMergeResultNotice({
          type: 'success',
          text: `Consolidation complete: ${result.records_merged} record(s) merged into '${result.surviving_lead?.business_name}'. Reassigned ${result.messages_reassigned} messages and ${result.tasks_reassigned} follow-up tasks.`
        });
        handleScanDuplicates();
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        setMergeResultNotice({ type: 'error', text: err.error || 'Failed to merge duplicate group.' });
      }
    } catch (e) {
      setMergeResultNotice({ type: 'error', text: 'Network error during duplicate merge execution.' });
    } finally {
      setMergingGroupId(null);
      setDryRunPreview(null);
    }
  };

  const supabaseInfo = apiStatus?.supabase || {};
  const emailInfo = apiStatus?.email_provider || {};
  const publicFeInfo = apiStatus?.public_frontend_url || {};
  const aiProviderInfo = apiStatus?.ai_provider || {};
  const currentGmail = gmailStatus || apiStatus?.gmail || {};

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* GMAIL NOTIFICATION BANNER */}
      {gmailNotice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 18px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 600,
          backgroundColor: gmailNotice.type === 'success' ? '#ECFDF5' : gmailNotice.type === 'error' ? '#FEF2F2' : '#EFF6FF',
          color: gmailNotice.type === 'success' ? '#065F46' : gmailNotice.type === 'error' ? '#991B1B' : '#1E40AF',
          border: `1px solid ${gmailNotice.type === 'success' ? '#A7F3D0' : gmailNotice.type === 'error' ? '#FECACA' : '#BFDBFE'}`
        }}>
          {gmailNotice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{gmailNotice.text}</span>
        </div>
      )}

      {/* SECTION 1: Core Architecture & AI / Gmail Integrations */}
      <div className="card-surface" style={{ padding: '24px', borderRadius: '14px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
          Provider Integrations & Architecture Status
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
          Transparent audit of active runtime providers, AI drafting engine, Google OAuth, and persistence tier.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          
          {/* 1. AI Email Drafting Provider Card */}
          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1px solid #D6E4FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>AI Drafting Provider</span>
              </div>
              <span className={`badge ${aiProviderInfo.has_api_key ? 'badge-blue' : 'badge-gray'}`}>
                {aiProviderInfo.has_api_key ? 'Gemini 1.5 Flash' : 'Grounded Template Engine'}
              </span>
            </div>
            
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Runtime Mode: <strong>{aiProviderInfo.mode || 'Deterministic Grounded Templates'}</strong>
            </div>
            
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '8px' }}>
              {aiProviderInfo.note || 'GEMINI_API_KEY is not configured in backend environment. Drafting runs on local deterministic template engine grounded in website audits and verified lead data.'}
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid #E2E8F0', paddingTop: '6px' }}>
              Backend Env: <code>GEMINI_API_KEY</code> • Never exposed to frontend.
            </div>
          </div>

          {/* 2. Official Gmail Draft Integration Card */}
          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: currentGmail.is_connected ? '1.5px solid #A7F3D0' : currentGmail.requires_reconnect ? '1.5px solid #FCA5A5' : '1px solid #D6E4FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Gmail Draft Integration</span>
              </div>
              <span className={`badge ${currentGmail.is_connected ? 'badge-green' : currentGmail.requires_reconnect ? 'badge-red' : 'badge-amber'}`}>
                {currentGmail.is_connected ? 'Connected' : currentGmail.requires_reconnect ? 'Session Expired' : 'Not Connected'}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              {currentGmail.is_connected ? (
                <span>Account: <strong>{currentGmail.connected_email}</strong></span>
              ) : currentGmail.requires_reconnect ? (
                <span style={{ color: '#DC2626', fontWeight: 600 }}>Gmail session expired. Reconnect your Google account.</span>
              ) : currentGmail.is_configured ? (
                <span>OAuth Configured • Authorization Required</span>
              ) : (
                <span>OAuth Credentials Missing in .env</span>
              )}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '10px' }}>
              Strict compose scope: <code>gmail.compose</code>. Drafts are placed into your Drafts folder and <strong>NEVER sent automatically</strong>.
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
              {currentGmail.is_connected ? (
                <button
                  type="button"
                  onClick={handleDisconnectGmail}
                  disabled={disconnectingGmail}
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#DC2626' }}
                >
                  <Unlink size={12} />
                  {disconnectingGmail ? 'Disconnecting...' : 'Disconnect Gmail'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  className="btn-primary"
                  style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: currentGmail.requires_reconnect ? '#DC2626' : undefined }}
                >
                  {connectingGmail ? <RefreshCw size={12} style={{ animation: 'spin 1.2s linear infinite' }} /> : <Mail size={12} />}
                  {currentGmail.requires_reconnect ? 'Reconnect Google Account' : 'Connect Gmail Account'}
                </button>
              )}

              <a
                href="https://mail.google.com/mail/u/0/#drafts"
                target="_blank"
                rel="noreferrer"
                className="btn-link"
                style={{ fontSize: '12px' }}
              >
                Open Gmail Drafts <ExternalLink size={11} style={{ display: 'inline' }} />
              </a>
            </div>
          </div>

          {/* 3. Database Persistence */}
          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1px solid #D6E4FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Database Storage</span>
              </div>
              <span className={`badge ${supabaseInfo.is_connected ? 'badge-green' : 'badge-amber'}`}>
                {supabaseInfo.mode || (isDemoMode ? 'Local JSON' : 'Supabase Cloud')}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Status: <strong>{supabaseInfo.status || 'Active'}</strong>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Supabase PostgreSQL persistence with local JSON fallback.
            </div>
          </div>

          {/* 4. SerpAPI Status */}
          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1px solid #D6E4FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>SerpAPI (Google Maps)</span>
              </div>
              <span className="badge badge-green">Operational</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Active Keys: {apiStatus?.serpapi?.active_keys ?? 1} / {apiStatus?.serpapi?.total_keys ?? 1}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Kilometre radius search and deduplication manager.
            </div>
          </div>

          {/* 5. Public Frontend URL */}
          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1px solid #D6E4FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Public Frontend URL</span>
              </div>
              <span className={`badge ${publicFeInfo.is_configured ? 'badge-green' : 'badge-red'}`}>
                {publicFeInfo.status || 'Configured'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'monospace', marginBottom: '4px' }}>
              {publicFeInfo.url || 'Not Configured'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Required for customer private chat links. Configured in <code>PUBLIC_FRONTEND_URL</code>.
            </div>
          </div>

        </div>
      </div>

      {/* SECTION: Regional Preferences & Currency Settings */}
      <div className="card-surface" style={{ padding: '24px', borderRadius: '14px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Coins size={22} color="var(--primary)" />
          <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Regional Preferences & Currency
          </h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
          Select your application-wide default display currency. Indian Rupees (₹ / INR) with en-IN formatting is the default for all new installations.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1px solid #D6E4FF' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
              Active Display Currency:
            </label>
            <select
              id="currency_selector_settings"
              value={appCurrency}
              onChange={(e) => setAppCurrency(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {SUPPORTED_CURRENCIES.map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Persisted in local preferences. Applies consistently to Find Leads, Audit Results, Workspace, CRM Pipeline, and Reports without corrupting stored data.
            </div>
          </div>

          <div className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1.5px solid #A7F3D0', backgroundColor: '#F0FDF4' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#065F46', marginBottom: '10px' }}>
              Live Currency Formatting Preview ({appCurrency}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#047857' }}>Small project scope:</span>
                <strong style={{ color: '#065F46', fontFamily: 'var(--font-display)' }}>{formatCurrency(5000, appCurrency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#047857' }}>Standard modernization:</span>
                <strong style={{ color: '#065F46', fontFamily: 'var(--font-display)' }}>{formatCurrency(125000, appCurrency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#047857' }}>Enterprise digital overhaul:</span>
                <strong style={{ color: '#065F46', fontFamily: 'var(--font-display)' }}>{formatCurrency(1250000, appCurrency)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Duplicate Leads Scanner and Safe Merge Tool */}
      <div className="card-surface" style={{ padding: '24px', borderRadius: '14px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} color="var(--primary)" />
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Duplicate Leads Scanner & Safe Consolidation
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Detect candidate duplicate records using normalized website domains, phone numbers, and addresses. Merge duplicates non-destructively while preserving conversations, tasks, and notes.
            </p>
          </div>

          <button
            onClick={handleScanDuplicates}
            disabled={scanningDups}
            className="btn-primary"
            style={{ padding: '8px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={14} style={{ animation: scanningDups ? 'spin 1.2s linear infinite' : 'none' }} />
            {scanningDups ? 'Scanning CRM...' : 'Scan for Duplicates'}
          </button>
        </div>

        {/* Scan Message */}
        {scanMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
            backgroundColor: scanMessage.type === 'success' ? '#EDFBF5' : scanMessage.type === 'error' ? '#FEECEB' : '#EDF3FF',
            color: scanMessage.type === 'success' ? 'var(--success)' : scanMessage.type === 'error' ? 'var(--danger)' : 'var(--primary)',
            border: `1px solid ${scanMessage.type === 'success' ? '#A3E6CD' : scanMessage.type === 'error' ? '#FCA5A5' : '#D6E4FF'}`
          }}>
            {scanMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{scanMessage.text}</span>
          </div>
        )}

        {/* Merge Result Message */}
        {mergeResultNotice && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
            backgroundColor: mergeResultNotice.type === 'success' ? '#EDFBF5' : '#FEECEB',
            color: mergeResultNotice.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${mergeResultNotice.type === 'success' ? '#A3E6CD' : '#FCA5A5'}`
          }}>
            <CheckCircle2 size={16} />
            <span>{mergeResultNotice.text}</span>
          </div>
        )}

        {/* Duplicate Clusters List */}
        {duplicateGroups && duplicateGroups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {duplicateGroups.map((group, index) => {
              const surviving = group.surviving_lead;
              const duplicates = group.duplicate_leads || [];
              const isMergingThis = mergingGroupId === group.surviving_id;
              const isPreviewingThis = dryRunPreview?.groupId === group.surviving_id;

              return (
                <div key={group.surviving_id || index} className="card-soft" style={{ padding: '18px', borderRadius: '12px', border: '1px solid #D6E4FF' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Cluster #{index + 1}: {surviving?.business_name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600, marginTop: '2px' }}>
                        Match Signals: {group.match_reasons?.join(', ') || 'Identical domain/phone'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleDryRunMerge(group)}
                        disabled={isMergingThis}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Eye size={12} /> Dry-Run Preview
                      </button>
                      <button
                        onClick={() => handleExecuteMerge(group)}
                        disabled={isMergingThis}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <GitMerge size={12} />
                        {isMergingThis ? 'Consolidating...' : 'Safely Merge Group'}
                      </button>
                    </div>
                  </div>

                  {/* Dry Run Preview Box */}
                  {isPreviewingThis && (
                    <div style={{ backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px', fontSize: '12px' }}>
                      <strong>Dry-Run Preview:</strong> {dryRunPreview.message}
                      <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Duplicate records to remove: {dryRunPreview.duplicates_to_remove?.join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Surviving vs Duplicate Records Comparison */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    
                    {/* Surviving Lead (Preserved) */}
                    <div style={{ backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1.5px solid var(--primary)' }}>
                      <span className="badge badge-blue" style={{ marginBottom: '6px', display: 'inline-block' }}>
                        Surviving Record (Primary)
                      </span>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{surviving?.business_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Domain: {surviving?.website || 'None'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Phone: {surviving?.phone || 'None'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stage: {surviving?.lifecycle_stage}</div>
                    </div>

                    {/* Duplicate Candidates to be merged */}
                    {duplicates.map((dup) => (
                      <div key={dup.id} style={{ backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                        <span className="badge badge-gray" style={{ marginBottom: '6px', display: 'inline-block' }}>
                          Duplicate to Merge
                        </span>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{dup.business_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Domain: {dup.website || 'None'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Phone: {dup.phone || 'None'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stage: {dup.lifecycle_stage}</div>
                      </div>
                    ))}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
