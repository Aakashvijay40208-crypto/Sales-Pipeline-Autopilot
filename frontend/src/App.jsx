import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import OverviewView from './components/OverviewView';
import FindLeadsView from './components/FindLeadsView';
import PipelineView from './components/PipelineView';
import ConversationsView from './components/ConversationsView';
import FollowUpsView from './components/FollowUpsView';
import ReplyLabView from './components/ReplyLabView';
import SettingsView from './components/SettingsView';
import LeadWorkspaceModal from './components/LeadWorkspaceModal';
import CustomerChatView from './components/CustomerChatView';
import CursorGlow from './components/CursorGlow';
import { Bot, Mail, Lock, Sparkles, ShieldAlert, LogIn, ArrowRight } from 'lucide-react';
import './styles/theme.css';

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function AppContent() {
  const { user, loginWithGoogle, loginWithEmail, logout, isDemoMode } = useAuth();
  
  // URL routing for private customer chat link (/chat/:token)
  const pathname = window.location.pathname;
  if (pathname.startsWith('/chat/')) {
    const chatToken = pathname.replace('/chat/', '').split('/')[0];
    if (chatToken) {
      return <CustomerChatView token={chatToken} backendUrl={BACKEND_URL} />;
    }
  }

  // Active navigation view: 'overview' | 'find-leads' | 'pipeline' | 'conversations' | 'follow-ups' | 'reply-lab' | 'settings'
  const [currentView, setCurrentView] = useState('overview');

  // CRM Leads and Statistics states
  const [crmLeads, setCrmLeads] = useState([]);
  const [discoveredLeads, setDiscoveredLeads] = useState([]);
  const [overviewStats, setOverviewStats] = useState({
    totalSavedLeads: 0,
    qualifiedLeads: 0,
    interestedCustomers: 0,
    followUpsDueToday: 0,
    overdueFollowUps: 0,
    leadsWaitingForReply: 0,
    attentionCount: 0,
    recentActivities: []
  });
  const [apiStatus, setApiStatus] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  // Selected lead for Dossier modal / workspace
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [currentSearchId, setCurrentSearchId] = useState(null);

  // Discovery Filters & Sorting states (for Find Leads view)
  const [discoveryFilters, setDiscoveryFilters] = useState({
    city: '',
    website: '',
    leadScore: '',
    rating: ''
  });
  const [discoverySortBy, setDiscoverySortBy] = useState('-score');

  // Login Form State
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Refresh all CRM and discovery data
  const refreshData = async () => {
    setRefreshing(true);
    try {
      // 1. Fetch CRM Leads
      const crmRes = await fetch(`${BACKEND_URL}/api/crm/leads`);
      if (crmRes.ok) {
        const crmData = await crmRes.json();
        setCrmLeads(crmData);
      }

      // 2. Fetch Overview Metrics
      const overviewRes = await fetch(`${BACKEND_URL}/api/crm/overview`);
      if (overviewRes.ok) {
        const ovData = await overviewRes.json();
        setOverviewStats(ovData);
      }

      // 3. Fetch Discovery Leads (from search scraper)
      const params = new URLSearchParams();
      Object.entries(discoveryFilters).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      if (discoverySortBy) params.append('sort_by', discoverySortBy);
      if (currentSearchId) params.append('search_id', currentSearchId);

      const leadsRes = await fetch(`${BACKEND_URL}/api/leads?${params.toString()}`);
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setDiscoveredLeads(leadsData);
      }

      // 4. Fetch API Status
      const apiRes = await fetch(`${BACKEND_URL}/api/api-status`);
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        setApiStatus(apiData);
      }
    } catch (e) {
      console.error("Failed to sync CRM data:", e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user, discoveryFilters, discoverySortBy, currentSearchId]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const { data, error } = await loginWithEmail(emailInput, passwordInput);
    setLoginLoading(false);
    if (error) {
      setLoginError(error.message || "Invalid email or password");
    }
  };

  const handleDemoSignIn = async () => {
    setLoginLoading(true);
    await loginWithEmail('sales@autopilot.ai', 'demo1234');
    setLoginLoading(false);
  };

  const handleUpdateStage = async (leadId, newStage) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle_stage: newStage })
      });
      if (res.ok) refreshData();
    } catch (e) {
      console.error(e);
    }
  };

  // Unauthenticated: Modern Light B2B SaaS Login
  if (!user) {
    return (
      <div style={loginContainerStyle}>
        <div className="card-surface animate-fade-in" style={loginCardStyle}>
          {/* Logo Header */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '24px' }}>
            <div style={loginLogoIconStyle}>
              <Bot size={28} color="#FFFFFF" />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '14px', fontFamily: 'var(--font-display)', margin: '14px 0 4px 0' }}>
              Sales Pipeline Autopilot
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              AI-Powered Sales Discovery, CRM & Follow-up Engine
            </p>
          </div>

          {/* Demo quick launch button */}
          <div style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid #D6E4FF', borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
              <Sparkles size={16} /> Instant Access (Demo Mode)
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
              Launch straight into the sales workspace with local persistent storage.
            </p>
            <button
              onClick={handleDemoSignIn}
              disabled={loginLoading}
              className="btn-primary"
              style={{ width: '100%', padding: '9px 14px', fontSize: '13px' }}
            >
              Sign In to Autopilot Workspace <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
            <span>or sign in with credentials</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  placeholder="rep@agency.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                  required
                />
              </div>
            </div>

            {loginError && (
              <div style={{ backgroundColor: '#FEECEB', color: 'var(--danger)', padding: '10px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={14} /> {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="btn-secondary"
              style={{ width: '100%', marginTop: '4px' }}
            >
              Sign In with Email
            </button>
          </form>
        </div>
      </div>
    );
  }

  // View Title and Subtitle Mapping
  const viewTitles = {
    'overview': { title: 'Executive Overview', desc: 'Real-time pipeline metrics, conversion performance, and activity feeds.' },
    'find-leads': { title: 'Prospect Discovery & Audits', desc: 'Discover businesses by niche and run automated Playwright website audits.' },
    'pipeline': { title: 'Sales Pipeline Kanban', desc: 'Manage lead lifecycle stages from Discovered through Won or Lost.' },
    'conversations': { title: 'Unified Conversations', desc: 'Complete chronological history across emails, customer chat, and internal notes.' },
    'follow-ups': { title: 'Follow-ups & AI Drafts', desc: 'Review scheduled reminders, approve tailored email drafts, and verify outreach.' },
    'reply-lab': { title: 'AI Reply Classification Lab', desc: 'Interactive sandbox to test natural language intent detection and CRM updates.' },
    'settings': { title: 'System Settings', desc: 'API health, database status, and operational controls.' }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--page-background)' }}>
      
      {/* Left Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        stats={overviewStats}
        user={user}
        onLogout={logout}
        isDemoMode={isDemoMode}
      />

      {/* Main Content View Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        
        {/* Top Header */}
        <TopHeader
          title={viewTitles[currentView]?.title || 'Sales Pipeline'}
          description={viewTitles[currentView]?.desc}
          onRefresh={refreshData}
          refreshing={refreshing}
        />

        {/* Dynamic View Body */}
        <div style={{ flex: 1 }}>
          {currentView === 'overview' && (
            <OverviewView
              stats={overviewStats}
              onNavigate={setCurrentView}
              onSelectLead={(id) => setSelectedLeadId(id)}
            />
          )}

          {currentView === 'find-leads' && (
            <FindLeadsView
              leads={discoveredLeads}
              filters={discoveryFilters}
              setFilters={setDiscoveryFilters}
              sortBy={discoverySortBy}
              setSortBy={setDiscoverySortBy}
              backendUrl={BACKEND_URL}
              onSearchComplete={(id) => {
                setCurrentSearchId(id);
                refreshData();
              }}
              onRefresh={refreshData}
              onOpenLeadWorkspace={(id) => setSelectedLeadId(id)}
            />
          )}

          {currentView === 'pipeline' && (
            <PipelineView
              leads={crmLeads}
              onSelectLead={(id) => setSelectedLeadId(id)}
              onUpdateStage={handleUpdateStage}
              backendUrl={BACKEND_URL}
            />
          )}

          {currentView === 'conversations' && (
            <ConversationsView
              leads={crmLeads}
              selectedLeadId={selectedLeadId}
              onSelectLead={(id) => setSelectedLeadId(id)}
              backendUrl={BACKEND_URL}
              onRefresh={refreshData}
            />
          )}

          {currentView === 'follow-ups' && (
            <FollowUpsView
              backendUrl={BACKEND_URL}
              onRefresh={refreshData}
            />
          )}

          {currentView === 'reply-lab' && (
            <ReplyLabView
              backendUrl={BACKEND_URL}
              leads={crmLeads}
              onRefresh={refreshData}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              apiStatus={apiStatus}
              isDemoMode={isDemoMode}
              backendUrl={BACKEND_URL}
              onRefresh={refreshData}
            />
          )}
        </div>

      </main>

      {/* Complete Lead Detail Dossier Workspace Modal */}
      {selectedLeadId && (
        <LeadWorkspaceModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          backendUrl={BACKEND_URL}
          onLeadUpdated={refreshData}
        />
      )}

    </div>
  );
}

export default function App() {
  return (
    <>
      <CursorGlow />
      <AppContent />
    </>
  );
}

const loginContainerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--page-background)',
  padding: '20px',
};

const loginCardStyle = {
  width: '420px',
  padding: '36px',
  boxShadow: 'var(--shadow-lg)',
  borderRadius: '16px',
};

const loginLogoIconStyle = {
  width: '54px',
  height: '54px',
  borderRadius: '14px',
  backgroundColor: 'var(--primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 6px 16px rgba(79, 125, 243, 0.35)',
};
