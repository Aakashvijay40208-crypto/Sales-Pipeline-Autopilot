import React from 'react';
import {
  Users,
  CheckCircle2,
  ThumbsUp,
  Clock,
  AlertTriangle,
  MailQuestion,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Search,
  Calendar,
  MessageSquare
} from 'lucide-react';

export default function OverviewView({ stats, onNavigate, onSelectLead }) {
  const statCards = [
    {
      title: 'Total Saved Leads',
      value: stats?.totalSavedLeads ?? 0,
      icon: Users,
      color: '#4F7DF3',
      bgColor: '#EDF3FF',
      viewTarget: 'pipeline'
    },
    {
      title: 'Qualified Leads',
      value: stats?.qualifiedLeads ?? 0,
      icon: CheckCircle2,
      color: '#19966B',
      bgColor: '#E8F8F0',
      viewTarget: 'pipeline'
    },
    {
      title: 'Interested Customers',
      value: stats?.interestedCustomers ?? 0,
      icon: ThumbsUp,
      color: '#4F7DF3',
      bgColor: '#EDF3FF',
      viewTarget: 'pipeline'
    },
    {
      title: 'Follow-ups Due Today',
      value: stats?.followUpsDueToday ?? 0,
      icon: Clock,
      color: stats?.followUpsDueToday > 0 ? '#D95757' : '#718096',
      bgColor: stats?.followUpsDueToday > 0 ? '#FEECEB' : '#F1F4F9',
      viewTarget: 'follow-ups'
    },
    {
      title: 'Overdue Follow-ups',
      value: stats?.overdueFollowUps ?? 0,
      icon: AlertTriangle,
      color: stats?.overdueFollowUps > 0 ? '#D95757' : '#718096',
      bgColor: stats?.overdueFollowUps > 0 ? '#FEECEB' : '#F1F4F9',
      viewTarget: 'follow-ups'
    },
    {
      title: 'Waiting for Reply',
      value: stats?.leadsWaitingForReply ?? 0,
      icon: MailQuestion,
      color: '#D99A2B',
      bgColor: '#FFF8E6',
      viewTarget: 'conversations'
    },
    {
      title: 'Needs Attention',
      value: stats?.attentionCount ?? 0,
      icon: ShieldAlert,
      color: stats?.attentionCount > 0 ? '#D95757' : '#718096',
      bgColor: stats?.attentionCount > 0 ? '#FEECEB' : '#F1F4F9',
      viewTarget: 'pipeline'
    }
  ];

  const recentActivities = stats?.recentActivities || [];

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Quick Launch Banner */}
      <div style={heroBannerStyle}>
        <div style={{ maxWidth: '600px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
            <Sparkles size={13} />
            <span>Autonomous Sales Operations</span>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0', fontFamily: 'var(--font-display)' }}>
            Welcome to Sales Pipeline Autopilot
          </h2>
          <p style={{ fontSize: '14px', opacity: 0.9, lineHeight: 1.5, margin: 0 }}>
            Continuous lead discovery, automated reply classification, instant CRM stage updates, and verified follow-up schedules.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('find-leads')} className="btn-secondary" style={{ backgroundColor: '#FFFFFF', color: 'var(--primary)', border: 'none' }}>
            <Search size={15} /> Find Leads
          </button>
          <button onClick={() => onNavigate('reply-lab')} className="btn-secondary" style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.3)' }}>
            <Sparkles size={15} /> Test in Reply Lab
          </button>
        </div>
      </div>

      {/* Stats Metric Cards Grid */}
      <div style={gridStatsStyle}>
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className="card-surface"
              onClick={() => onNavigate(card.viewTarget)}
              style={{ padding: '18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {card.title}
                </span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: card.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={card.color} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                {card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section: Recent Activity Timeline & Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px' }}>
        
        {/* Recent Activities Feed */}
        <div className="card-surface" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Recent Sales Pipeline Activity
            </h3>
            <button onClick={() => onNavigate('pipeline')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View Pipeline <ArrowRight size={14} />
            </button>
          </div>

          {recentActivities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              No recent activity yet. Discover leads or test a customer reply in the Reply Lab to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentActivities.map((act) => (
                <div
                  key={act.id}
                  style={activityItemStyle}
                  onClick={() => act.lead_id && onSelectLead(act.lead_id)}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', marginTop: '6px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {act.description}
                    </div>
                    {act.reason && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {act.reason}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {act.timestamp ? new Date(act.timestamp).toLocaleString() : 'Just now'} • by {act.performed_by || 'Autopilot'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Shortcuts & Best Practices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-surface" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>
              Daily Sales Checklist
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={checklistCardStyle}
                onClick={() => onNavigate('follow-ups')}
              >
                <Calendar size={16} color="var(--primary)" />
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>
                  Review Follow-ups Due Today ({stats?.followUpsDueToday || 0})
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>

              <div
                style={checklistCardStyle}
                onClick={() => onNavigate('conversations')}
              >
                <MessageSquare size={16} color="var(--primary)" />
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>
                  Record Incoming Customer Replies
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>

              <div
                style={checklistCardStyle}
                onClick={() => onNavigate('find-leads')}
              >
                <Search size={16} color="var(--primary)" />
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>
                  Prospect & Audit Local Businesses
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>
            </div>
          </div>

          <div className="card-soft" style={{ padding: '16px', display: 'flex', gap: '12px' }}>
            <Sparkles size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
                How Autopilot Handles Inbound Replies
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                When customer replies are recorded, our engine extracts their intent (Interested, Meeting Request, Follow-up in 5 Months, or Opt-out). The CRM stage updates automatically, drafts follow-up emails, and sets accurate reminder dates.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const heroBannerStyle = {
  background: 'linear-gradient(135deg, #4F7DF3 0%, #3D68D8 100%)',
  borderRadius: '16px',
  padding: '24px 28px',
  color: '#FFFFFF',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '16px',
  boxShadow: '0 8px 24px rgba(79, 125, 243, 0.25)',
};

const gridStatsStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '16px',
};

const activityItemStyle = {
  display: 'flex',
  gap: '12px',
  padding: '10px 12px',
  backgroundColor: 'var(--page-background)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'background 0.15s ease',
};

const checklistCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  backgroundColor: 'var(--page-background)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  cursor: 'pointer',
};
