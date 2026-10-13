import React from 'react';
import { Sparkles, Bell, RefreshCw } from 'lucide-react';

export default function TopHeader({ title, description, onRefresh, refreshing }) {
  return (
    <header style={headerStyle}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
            {description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={refreshBtnStyle}
            title="Refresh Data"
          >
            <RefreshCw size={15} className={refreshing ? 'spin-loader' : ''} />
            <span style={{ fontSize: '13px' }}>Sync CRM</span>
          </button>
        )}

        <div style={badgeAutopilotStyle}>
          <Sparkles size={14} color="var(--primary)" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>
            Autopilot Active
          </span>
        </div>
      </div>
    </header>
  );
}

const headerStyle = {
  height: '64px',
  backgroundColor: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 28px',
  position: 'sticky',
  top: 0,
  zIndex: 9,
};

const refreshBtnStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  padding: '7px 14px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all 0.15s ease',
};

const badgeAutopilotStyle = {
  backgroundColor: '#EDF3FF',
  border: '1px solid #D1E1FF',
  padding: '6px 12px',
  borderRadius: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};
