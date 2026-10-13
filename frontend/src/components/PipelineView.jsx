import React, { useState, useEffect } from 'react';
import {
  Kanban,
  List,
  Search,
  Filter,
  Calendar,
  Phone,
  Globe,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  MoveHorizontal,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import LeadScoreGauge from './LeadScoreGauge';

const STAGES = [
  { id: 'Discovered', label: 'Discovered', color: '#718096' },
  { id: 'Qualified', label: 'Qualified', color: '#4F7DF3' },
  { id: 'Outreach Ready', label: 'Outreach Ready', color: '#6366F1' },
  { id: 'Contacted', label: 'Contacted', color: '#D99A2B' },
  { id: 'Interested', label: 'Interested', color: '#19966B' },
  { id: 'Follow-up Later', label: 'Follow-up Later', color: '#3B82F6' },
  { id: 'Meeting Requested', label: 'Meeting Requested', color: '#8B5CF6' },
  { id: 'Opportunity', label: 'Opportunity', color: '#06B6D4' },
  { id: 'Won', label: 'Won', color: '#19966B' },
  { id: 'Lost', label: 'Lost', color: '#94A3B8' },
  { id: 'Opted Out', label: 'Opted Out', color: '#D95757' }
];

export default function PipelineView({ leads = [], onSelectLead, onUpdateStage, backendUrl }) {
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  // Local optimistic state for immediate drag-and-drop feedback
  const [localLeads, setLocalLeads] = useState(leads);
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const [updatingLeadId, setUpdatingLeadId] = useState(null);

  // Sync with prop updates
  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const filteredLeads = localLeads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      (lead.business_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.address || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = !stageFilter || lead.lifecycle_stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  // Safe status transition handler with optimistic update and rollback
  const handleTransitionStatus = async (leadId, newStage) => {
    if (!leadId || !newStage) return;
    const currentLead = localLeads.find((l) => l.id === leadId);
    if (!currentLead || currentLead.lifecycle_stage === newStage) return;

    const previousStage = currentLead.lifecycle_stage;
    setUpdatingLeadId(leadId);
    setUpdateError(null);

    // 1. Optimistic local update
    setLocalLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, lifecycle_stage: newStage } : l))
    );

    // 2. Persist to backend
    try {
      if (onUpdateStage) {
        await onUpdateStage(leadId, newStage);
      } else {
        const res = await fetch(`${backendUrl}/api/crm/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lifecycle_stage: newStage })
        });
        if (!res.ok) {
          throw new Error('Server rejected stage update.');
        }
      }
    } catch (err) {
      console.error('Failed to update lead status:', err);
      // Rollback optimistic state
      setLocalLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, lifecycle_stage: previousStage } : l))
      );
      setUpdateError(`Failed to move '${currentLead.business_name}' to ${newStage}. Reverted to ${previousStage}.`);
    } finally {
      setUpdatingLeadId(null);
    }
  };

  // --- HTML5 Drag and Drop Event Handlers ---
  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedLeadId(leadId);
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverStageId(null);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleDragLeave = (e, stageId) => {
    // Only clear if mouse is leaving the column element itself
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverStageId === stageId) {
      setDragOverStageId(null);
    }
  };

  const handleDrop = (e, targetStageId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    setDragOverStageId(null);
    setDraggedLeadId(null);

    if (leadId) {
      handleTransitionStatus(leadId, targetStageId);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '520px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              placeholder="Search CRM leads by name, category, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{ width: '180px' }}
          >
            <option value="">All Stages</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px' }}>
          <button
            onClick={() => setViewMode('kanban')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'kanban' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'kanban' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Kanban size={14} /> Kanban
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'table' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'table' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <List size={14} /> Table
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {updateError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: '#FEECEB',
          color: 'var(--danger)',
          borderRadius: '8px',
          border: '1px solid #FCA5A5',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <AlertCircle size={16} />
          <span style={{ flex: 1 }}>{updateError}</span>
          <button
            onClick={() => setUpdateError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Kanban Board View */}
      {viewMode === 'kanban' ? (
        <div style={kanbanBoardContainerStyle}>
          {STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.lifecycle_stage === stage.id);
            const isDropTarget = dragOverStageId === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={(e) => handleDragLeave(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                style={{
                  ...kanbanColumnStyle,
                  backgroundColor: isDropTarget ? 'rgba(79, 125, 243, 0.08)' : 'var(--surface-soft)',
                  border: isDropTarget ? '2px dashed var(--primary)' : '1px solid var(--border)',
                  transform: isDropTarget ? 'scale(1.01)' : 'none',
                  transition: 'background-color 0.15s ease, border 0.15s ease, transform 0.15s ease'
                }}
              >
                {/* Column Header */}
                <div style={kanbanHeaderStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: stage.color }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {stage.label}
                    </span>
                  </div>
                  <span style={countBadgeStyle}>{stageLeads.length}</span>
                </div>

                {/* Cards Container */}
                <div style={cardsListContainerStyle}>
                  {stageLeads.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '32px 12px',
                      color: isDropTarget ? 'var(--primary)' : 'var(--text-muted)',
                      fontSize: '12px',
                      border: isDropTarget ? '1px dashed var(--primary)' : '1px dashed transparent',
                      borderRadius: '8px'
                    }}>
                      {isDropTarget ? 'Drop lead here' : 'No leads'}
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const isBeingDragged = draggedLeadId === lead.id;
                      const isUpdating = updatingLeadId === lead.id;

                      return (
                        <div
                          key={lead.id}
                          draggable={!isUpdating}
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => onSelectLead(lead.id)}
                          className="card-surface"
                          style={{
                            ...kanbanCardStyle,
                            opacity: isBeingDragged ? 0.45 : isUpdating ? 0.7 : 1,
                            cursor: isUpdating ? 'wait' : 'grab',
                            border: isBeingDragged ? '1px dashed var(--primary)' : '1px solid var(--border)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                              {lead.business_name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <LeadScoreGauge score={lead.lead_score} priority={lead.priority} size="compact" showLabel={false} />
                              <span className={`badge ${lead.priority === 'HOT' ? 'badge-red' : lead.priority === 'MEDIUM' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                                {lead.priority || 'MED'}
                              </span>
                            </div>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            {lead.category} {lead.address ? `• ${lead.address.split(',')[0]}` : ''}
                          </div>

                          {/* Opt-out or Latest Reply classification badge */}
                          {lead.is_opted_out ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FEECEB', color: 'var(--danger)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>
                              <ShieldAlert size={12} /> Do Not Contact (Opted Out)
                            </div>
                          ) : lead.latest_reply_classification && lead.latest_reply_classification !== 'None' ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#EDF3FF', color: 'var(--primary)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>
                              <Sparkles size={12} /> Reply: {lead.latest_reply_classification}
                            </div>
                          ) : null}

                          {/* Confirmed Budget or Budget Type */}
                          {lead.confirmed_budget ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '5px', padding: '2px 7px', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>
                              <CheckCircle2 size={11} /> {lead.confirmed_budget} (Confirmed)
                            </div>
                          ) : lead.budget_type && lead.budget_type !== 'Not discussed' ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', color: '#475569', borderRadius: '5px', padding: '2px 7px', fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>
                              Budget: {lead.budget_type}
                            </div>
                          ) : null}

                          {/* Requested Service */}
                          {lead.requested_service && (
                            <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              🎯 {lead.requested_service}
                            </div>
                          )}

                          {/* Follow-up date */}
                          {lead.next_follow_up_date && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                              <Calendar size={12} />
                              Due: {new Date(lead.next_follow_up_date).toLocaleDateString()}
                            </div>
                          )}

                          {/* Accessible Status Dropdown alternative */}
                          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '8px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <MoveHorizontal size={11} /> Move:
                            </span>
                            <select
                              value={lead.lifecycle_stage}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleTransitionStatus(lead.id, e.target.value)}
                              style={{
                                fontSize: '11px',
                                padding: '3px 6px',
                                width: 'auto',
                                borderRadius: '5px',
                                border: '1px solid var(--border)',
                                backgroundColor: '#FFFFFF',
                                color: 'var(--text-primary)'
                              }}
                            >
                              {STAGES.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="card-surface" style={{ overflowX: 'auto', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-soft)' }}>
                <th style={thStyle}>Business Name</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Stage</th>
                <th style={thStyle}>Latest Classification</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Follow-up Date</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => onSelectLead(lead.id)}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{lead.business_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lead.phone || lead.website || 'No contact'}</div>
                    {lead.confirmed_budget && (
                      <div style={{ marginTop: '2px', fontSize: '11px', color: '#065F46', fontWeight: 700 }}>
                        ✓ {lead.confirmed_budget} (Confirmed)
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{lead.category}</td>
                  <td style={tdStyle}>
                    <select
                      value={lead.lifecycle_stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleTransitionStatus(lead.id, e.target.value)}
                      style={{ fontSize: '12px', padding: '4px 8px', width: 'auto' }}
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    {lead.latest_reply_classification && lead.latest_reply_classification !== 'None' ? (
                      <span className="badge badge-blue">{lead.latest_reply_classification}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>None</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LeadScoreGauge score={lead.lead_score} priority={lead.priority} size="compact" showLabel={false} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}>
                          {lead.lead_score !== undefined && lead.lead_score !== null ? `${lead.lead_score}/100` : '—'}
                        </span>
                        <span className={`badge ${lead.priority === 'HOT' ? 'badge-red' : lead.priority === 'MEDIUM' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: '9px', padding: '1px 5px', marginTop: '2px' }}>
                          {lead.priority || 'MED'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {lead.next_follow_up_date ? (
                      new Date(lead.next_follow_up_date).toLocaleDateString()
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not set</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLead(lead.id);
                      }}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      Workspace
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const kanbanBoardContainerStyle = {
  display: 'flex',
  gap: '16px',
  overflowX: 'auto',
  paddingBottom: '16px',
  minHeight: '620px',
  alignItems: 'stretch'
};

const kanbanColumnStyle = {
  minWidth: '280px',
  maxWidth: '280px',
  borderRadius: '12px',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
};

const kanbanHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--border)'
};

const countBadgeStyle = {
  backgroundColor: '#FFFFFF',
  color: 'var(--text-secondary)',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 700,
  padding: '2px 8px',
  border: '1px solid var(--border)'
};

const cardsListContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  flex: 1,
  minHeight: '80px'
};

const kanbanCardStyle = {
  padding: '14px',
  borderRadius: '10px',
  backgroundColor: '#FFFFFF',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
};

const thStyle = {
  padding: '12px 16px',
  fontWeight: 700,
  color: 'var(--text-secondary)'
};

const tdStyle = {
  padding: '12px 16px'
};
