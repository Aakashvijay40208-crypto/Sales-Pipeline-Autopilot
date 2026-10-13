import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Clock,
  AlertTriangle,
  CheckCircle,
  Mail,
  Send,
  Calendar,
  XCircle,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function FollowUpsView({ backendUrl, onRefresh }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'today' | 'overdue' | 'upcoming' | 'completed'
  const [actionLoading, setActionLoading] = useState(null);
  const [feedbackNotice, setFeedbackNotice] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const url = filter === 'completed'
        ? `${backendUrl}/api/crm/tasks?status=completed`
        : filter === 'all'
        ? `${backendUrl}/api/crm/tasks`
        : `${backendUrl}/api/crm/tasks?due_filter=${filter}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [filter]);

  const handleApproveSend = async (taskId) => {
    setActionLoading(taskId);
    setFeedbackNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/crm/tasks/${taskId}/approve-send`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackNotice({
          type: 'success',
          text: data.message || 'Follow-up email draft approved and saved to conversation history.'
        });
        fetchTasks();
        if (onRefresh) onRefresh();
      } else {
        setFeedbackNotice({
          type: 'error',
          text: data.error || 'Failed to approve and dispatch follow-up.'
        });
      }
    } catch (e) {
      setFeedbackNotice({ type: 'error', text: 'Network error connecting to backend.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkComplete = async (taskId) => {
    setActionLoading(taskId);
    setFeedbackNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/crm/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      if (res.ok) {
        setFeedbackNotice({ type: 'success', text: 'Task marked as completed.' });
        fetchTasks();
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelTask = async (taskId) => {
    setActionLoading(taskId);
    setFeedbackNotice(null);
    try {
      const res = await fetch(`${backendUrl}/api/crm/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (res.ok) {
        setFeedbackNotice({ type: 'info', text: 'Task cancelled.' });
        fetchTasks();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Filters Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Tasks' },
            { id: 'today', label: 'Due Today' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button onClick={fetchTasks} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }}>
          <RefreshCw size={13} className={loading ? 'spin-loader' : ''} /> Refresh Tasks
        </button>
      </div>

      {/* Feedback Notice */}
      {feedbackNotice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
          backgroundColor: feedbackNotice.type === 'success' ? '#EDFBF5' : feedbackNotice.type === 'error' ? '#FEECEB' : '#EDF3FF',
          color: feedbackNotice.type === 'success' ? 'var(--success)' : feedbackNotice.type === 'error' ? 'var(--danger)' : 'var(--primary)',
          border: `1px solid ${feedbackNotice.type === 'success' ? '#A3E6CD' : feedbackNotice.type === 'error' ? '#FCA5A5' : '#D6E4FF'}`
        }}>
          {feedbackNotice.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span style={{ flex: 1 }}>{feedbackNotice.text}</span>
          <button
            onClick={() => setFeedbackNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Task Cards List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin-loader" style={{ marginBottom: '8px' }} />
          <div>Checking follow-up schedules...</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card-surface" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <CalendarClock size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
            No Follow-up Tasks in this View
          </h3>
          <p style={{ fontSize: '13px', margin: 0 }}>
            Tasks are scheduled automatically when customers reply with future timelines (e.g. "contact in 5 months") or meeting requests.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isCancelled = task.status === 'cancelled';
            const draft = task.email_draft;
            const dueDt = task.due_date ? new Date(task.due_date) : null;
            const isOverdue = dueDt && dueDt < new Date() && !isCompleted && !isCancelled;

            return (
              <div
                key={task.id}
                className="card-surface"
                style={{
                  padding: '20px',
                  borderLeft: isCompleted
                    ? '4px solid var(--success)'
                    : isOverdue
                    ? '4px solid var(--danger)'
                    : '4px solid var(--primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {task.title}
                      </span>
                      {isCompleted ? (
                        <span className="badge badge-green">Completed</span>
                      ) : isCancelled ? (
                        <span className="badge badge-gray">Cancelled</span>
                      ) : isOverdue ? (
                        <span className="badge badge-red">Overdue</span>
                      ) : (
                        <span className="badge badge-blue">Pending</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Lead: <strong>{task.business_name || 'CRM Lead'}</strong> {task.phone ? `• ${task.phone}` : ''} {task.email ? `• ${task.email}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <Calendar size={14} />
                    <span>Due Date: <strong>{dueDt ? dueDt.toLocaleDateString() : 'Immediate'}</strong></span>
                  </div>
                </div>

                {/* Description */}
                {task.description && (
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', backgroundColor: 'var(--page-background)', padding: '10px 14px', borderRadius: '8px' }}>
                    {task.description}
                  </div>
                )}

                {/* AI Draft Box */}
                {draft && draft.body && !isCompleted && (
                  <div className="card-soft" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>
                      <Sparkles size={14} /> AI Tailored Follow-up Email Draft
                    </div>
                    {draft.subject && (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Subject: {draft.subject}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '6px', border: '1px solid #D6E4FF' }}>
                      {draft.body}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                      <button
                        onClick={() => handleApproveSend(task.id)}
                        disabled={actionLoading === task.id}
                        className="btn-primary"
                        style={{ padding: '7px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {actionLoading === task.id ? <RefreshCw size={14} className="spin-loader" /> : <Send size={14} />}
                        Approve Email Draft
                      </button>
                    </div>
                  </div>
                )}

                {/* Task Actions Footer */}
                {!isCompleted && !isCancelled && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => handleCancelTask(task.id)}
                      disabled={actionLoading === task.id}
                      className="btn-danger"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      <XCircle size={13} /> Cancel Task
                    </button>
                    <button
                      onClick={() => handleMarkComplete(task.id)}
                      disabled={actionLoading === task.id}
                      className="btn-success"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      <CheckCircle size={13} /> Mark Completed
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
