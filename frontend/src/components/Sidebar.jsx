import React from 'react';
import {
  LayoutDashboard,
  Search,
  Kanban,
  MessageSquare,
  CalendarClock,
  Sparkles,
  Settings,
  LogOut,
  ShieldCheck,
  Bot
} from 'lucide-react';

export default function Sidebar({ currentView, setCurrentView, stats, user, onLogout, isDemoMode }) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'find-leads', label: 'Find Leads', icon: Search },
    { id: 'pipeline', label: 'Sales Pipeline', icon: Kanban },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare, badge: stats?.leadsWaitingForReply },
    { id: 'follow-ups', label: 'Follow-ups', icon: CalendarClock, badge: stats?.followUpsDueToday, badgeColor: 'red' },
    { id: 'reply-lab', label: 'Reply Lab', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside style={sidebarStyle}>
      {/* Brand Header */}
      <div style={brandContainerStyle}>
        <div style={logoIconStyle}>
          <Bot size={22} color="#FFFFFF" />
        </div>
        <div>
          <div style={brandTitleStyle}>Sales Pipeline</div>
          <div style={brandSubtitleStyle}>AUTOPILOT</div>
        </div>
      </div>

      {/* Nav List */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              style={{
                ...navButtonStyle,
                backgroundColor: isActive ? 'var(--surface-soft)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                fontWeight: isActive ? 600 : 500,
                borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
              }}
            >
              <Icon size={18} color={isActive ? 'var(--primary)' : 'var(--text-secondary)'} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: '14px' }}>{item.label}</span>
              {item.badge > 0 && (
                <span
                  style={{
                    backgroundColor: item.badgeColor === 'red' ? '#FEECEB' : '#EDF3FF',
                    color: item.badgeColor === 'red' ? 'var(--danger)' : 'var(--primary)',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 7px',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Mode Indicator & User Info */}
      <div style={bottomCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isDemoMode ? '#D99A2B' : '#19966B' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {isDemoMode ? 'Local / Demo Mode' : 'Connected to Supabase'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {user?.email || 'sales@autopilot.ai'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sales Representative</div>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

const sidebarStyle = {
  width: '240px',
  minWidth: '240px',
  backgroundColor: 'var(--surface)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  padding: '20px 14px',
  height: '100vh',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const brandContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '0 8px 24px 8px',
  borderBottom: '1px solid var(--border)',
  marginBottom: '16px',
};

const logoIconStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  backgroundColor: 'var(--primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 10px rgba(79, 125, 243, 0.3)',
};

const brandTitleStyle = {
  fontSize: '15px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1.2,
};

const brandSubtitleStyle = {
  fontSize: '10px',
  fontWeight: 800,
  color: 'var(--primary)',
  letterSpacing: '1px',
};

const navButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  width: '100%',
};

const bottomCardStyle = {
  backgroundColor: 'var(--page-background)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '12px',
  marginTop: 'auto',
};
