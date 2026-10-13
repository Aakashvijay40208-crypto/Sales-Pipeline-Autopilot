import React, { useState } from 'react';
import {
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Check,
  Plus,
  CheckSquare,
  Square,
  Sparkles,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import LeadScoreGauge from './LeadScoreGauge';

export default function LeadsGrid({
  leads = [],
  filters,
  setFilters,
  sortBy,
  setSortBy,
  onSelectLead,
  backendUrl,
  onRefresh
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Selected lead IDs for batch actions
  const [selectedPlaceIds, setSelectedPlaceIds] = useState(new Set());
  const [savingPlaceId, setSavingPlaceId] = useState(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Sorting Handler
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortBy(`-${field}`);
    } else {
      setSortBy(field);
    }
    setCurrentPage(1);
  };

  // Filter Handlers
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  // Pagination Math
  const totalItems = leads.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLeads = leads.slice(startIndex, startIndex + itemsPerPage);

  const handleExport = () => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    if (sortBy) params.append('sort_by', sortBy);
    window.open(`${backendUrl}/api/export?${params.toString()}`);
  };

  // Checkbox selection
  const toggleSelectLead = (placeId) => {
    setSelectedPlaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    const allSelected = paginatedLeads.every((l) => selectedPlaceIds.has(l.place_id));
    setSelectedPlaceIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        paginatedLeads.forEach((l) => next.delete(l.place_id));
      } else {
        paginatedLeads.forEach((l) => next.add(l.place_id));
      }
      return next;
    });
  };

  // Build normalized CRM payload from lead object
  const buildCrmPayload = (lead) => ({
    place_id: lead.place_id,
    business_name: lead.name,
    category: lead.category,
    address: lead.address,
    phone: lead.phone_number,
    website: lead.website,
    email: lead.audit_reports?.contacts?.emails?.[0] || '',
    linkedin: lead.audit_reports?.contacts?.socialLinks?.linkedin || '',
    google_rating: lead.google_rating,
    review_count: lead.review_count,
    lead_score: lead.lead_scores?.score || 50,
    priority: lead.lead_scores?.priority || 'MEDIUM',
    lifecycle_stage: 'Discovered',
    source: 'Prospect Scan'
  });

  // Single Add to CRM
  const handleAddSingleToCrm = async (lead) => {
    setSavingPlaceId(lead.place_id);
    setActionNotice(null);
    try {
      const payload = buildCrmPayload(lead);
      const res = await fetch(`${backendUrl}/api/crm/leads/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const savedLead = await res.json();
        const wasMerged = savedLead._was_merged;
        setActionNotice({
          type: 'success',
          text: wasMerged
            ? `Lead '${savedLead.business_name}' matched an existing CRM record and was merged without duplicates!`
            : `Lead '${savedLead.business_name}' was successfully added to your CRM Pipeline.`
        });
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        setActionNotice({ type: 'error', text: err.error || 'Failed to save lead to CRM.' });
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Network error saving lead to CRM.' });
    } finally {
      setSavingPlaceId(null);
    }
  };

  // Bulk Add Selected to CRM
  const handleBatchAddToCrm = async () => {
    const selectedLeads = leads.filter((l) => selectedPlaceIds.has(l.place_id));
    if (selectedLeads.length === 0) return;

    setBatchSaving(true);
    setActionNotice(null);
    try {
      const payloads = selectedLeads.map(buildCrmPayload);
      const res = await fetch(`${backendUrl}/api/crm/leads/batch-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: payloads })
      });
      if (res.ok) {
        const result = await res.json();
        setActionNotice({
          type: 'success',
          text: `Processed ${result.total} leads: ${result.added} newly added, ${result.merged} merged into existing CRM records.`
        });
        setSelectedPlaceIds(new Set());
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        setActionNotice({ type: 'error', text: err.error || 'Failed to batch save leads.' });
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Network error during batch CRM import.' });
    } finally {
      setBatchSaving(false);
    }
  };

  const isAllPageSelected =
    paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedPlaceIds.has(l.place_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Filtering Toolbar */}
      <div className="card-surface" style={{ padding: '16px 20px', borderRadius: '12px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          alignItems: 'end'
        }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Filter by City
            </label>
            <input 
              type="text" 
              placeholder="e.g. Austin"
              value={filters?.city || ''}
              onChange={(e) => handleFilterChange('city', e.target.value)}
              style={{ padding: '8px 12px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Website Presence
            </label>
            <select 
              value={filters?.website || ''}
              onChange={(e) => handleFilterChange('website', e.target.value)}
              style={{ padding: '8px 12px' }}
            >
              <option value="">All</option>
              <option value="yes">Has Website</option>
              <option value="no">No Website</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Priority Level
            </label>
            <select 
              value={filters?.leadScore || ''}
              onChange={(e) => handleFilterChange('leadScore', e.target.value)}
              style={{ padding: '8px 12px' }}
            >
              <option value="">All</option>
              <option value="HOT">Hot Leads</option>
              <option value="MEDIUM">Medium Leads</option>
              <option value="LOW">Low Leads</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Min Google Rating
            </label>
            <select 
              value={filters?.rating || ''}
              onChange={(e) => handleFilterChange('rating', e.target.value)}
              style={{ padding: '8px 12px' }}
            >
              <option value="">All</option>
              <option value="4.5">4.5★ & Up</option>
              <option value="4.0">4.0★ & Up</option>
              <option value="3.5">3.5★ & Up</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={handleExport}
              className="btn-secondary"
              style={{ width: '100%', padding: '9px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Download size={14} />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
          backgroundColor: actionNotice.type === 'success' ? '#EDFBF5' : '#FEECEB',
          color: actionNotice.type === 'success' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${actionNotice.type === 'success' ? '#A3E6CD' : '#FCA5A5'}`
        }}>
          {actionNotice.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span style={{ flex: 1 }}>{actionNotice.text}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {selectedPlaceIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          backgroundColor: 'var(--surface-soft)',
          border: '1px solid var(--primary)',
          borderRadius: '10px'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
            {selectedPlaceIds.size} {selectedPlaceIds.size === 1 ? 'lead' : 'leads'} selected
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setSelectedPlaceIds(new Set())}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Deselect All
            </button>
            <button
              onClick={handleBatchAddToCrm}
              disabled={batchSaving}
              className="btn-primary"
              style={{ padding: '6px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} />
              {batchSaving ? 'Adding to CRM...' : `Add Selected (${selectedPlaceIds.size}) to CRM`}
            </button>
          </div>
        </div>
      )}

      {/* Leads Table Container */}
      <div className="card-surface" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-soft)' }}>
                
                {/* Select All Checkbox */}
                <th style={{ padding: '14px 16px', width: '40px' }}>
                  <button
                    type="button"
                    onClick={toggleSelectAllPage}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                    title={isAllPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                  >
                    {isAllPageSelected ? (
                      <CheckSquare size={16} color="var(--primary)" />
                    ) : (
                      <Square size={16} color="var(--text-muted)" />
                    )}
                  </button>
                </th>

                <th 
                  onClick={() => handleSort('name')}
                  style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Business Name <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>Location & Phone</th>
                <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>Website</th>
                <th 
                  onClick={() => handleSort('rating')}
                  style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Google Rating <ArrowUpDown size={12} />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('score')}
                  style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Score <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>CRM Status</th>
                <th style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.length > 0 ? (
                paginatedLeads.map((lead) => {
                  const website = lead.website;
                  const websiteStatus = lead.website_status || (website ? "Website Available" : "No Website");
                  const rating = lead.google_rating || 0;
                  const reviewCount = lead.review_count || 0;
                  const scoreInfo = lead.lead_scores || {};
                  const score = scoreInfo.score ?? lead.lead_score ?? 50;
                  const priority = scoreInfo.priority || lead.priority || "MEDIUM";
                  const isSelected = selectedPlaceIds.has(lead.place_id);
                  const isSavingThis = savingPlaceId === lead.place_id;
                  const inCrm = Boolean(lead.is_in_crm);

                  return (
                    <tr 
                      key={lead.place_id} 
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: isSelected ? 'rgba(79, 125, 243, 0.04)' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '14px 16px' }}>
                        <button
                          type="button"
                          onClick={() => toggleSelectLead(lead.place_id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} color="var(--primary)" />
                          ) : (
                            <Square size={16} color="var(--text-muted)" />
                          )}
                        </button>
                      </td>

                      {/* Business Name */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                          {lead.name}
                        </div>
                        {website ? (
                          <a 
                            href={website} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '11px', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            {website.replace(/^https?:\/\//, '').substring(0, 26)}...
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            No website link
                          </div>
                        )}
                      </td>

                      {/* Address & Phone */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <div>{lead.address || "N/A"}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                          {lead.phone_number || "No Phone"}
                        </div>
                      </td>

                      {/* Website Badge */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '12px',
                          backgroundColor: website ? '#EDFBF5' : '#FEECEB',
                          color: website ? 'var(--success)' : 'var(--danger)',
                          border: `1px solid ${website ? '#A3E6CD' : '#FCA5A5'}`
                        }}>
                          {websiteStatus}
                        </span>
                      </td>

                      {/* Google Rating */}
                      <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{rating.toFixed(1)}★</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({reviewCount})</span>
                        </div>
                      </td>

                      {/* Score */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <LeadScoreGauge
                            score={scoreInfo.score ?? lead.lead_score ?? score}
                            priority={priority}
                            size="compact"
                            showLabel={false}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                              {(scoreInfo.score ?? lead.lead_score ?? score) !== null && (scoreInfo.score ?? lead.lead_score ?? score) !== undefined ? `${scoreInfo.score ?? lead.lead_score ?? score}/100` : '—'}
                            </span>
                            <span className={`badge ${priority === 'HOT' ? 'badge-red' : priority === 'MEDIUM' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                              {priority}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* CRM Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {inCrm ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: '#EDF3FF',
                            color: 'var(--primary)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            <Check size={12} /> In CRM ({lead.crm_stage || 'Active'})
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Discovered Lead
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button 
                            onClick={() => onSelectLead(lead.place_id)}
                            className="btn-secondary" 
                            style={{ padding: '5px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="View technical website audit"
                          >
                            <Eye size={12} />
                            Audit
                          </button>

                          {inCrm ? (
                            <button
                              disabled
                              style={{
                                padding: '5px 10px',
                                fontSize: '12px',
                                backgroundColor: 'var(--surface-soft)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                cursor: 'default',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Check size={12} /> Enrolled
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAddSingleToCrm(lead)}
                              disabled={isSavingThis}
                              className="btn-primary"
                              style={{ padding: '5px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Plus size={12} />
                              {isSavingThis ? 'Adding...' : 'Add to CRM'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ maxWidth: '360px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Sparkles size={28} color="var(--primary)" />
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                        No prospects found yet
                      </div>
                      <p style={{ fontSize: '13px', margin: 0, lineHeight: 1.4 }}>
                        Enter a business category, location, and kilometre radius above, then click <strong>Analyze & Find Leads</strong> to discover qualified local prospects.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface-soft)'
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Showing {startIndex + 1}–{Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems} leads
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="btn-secondary"
                style={{ padding: '5px 9px' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn-secondary"
                style={{ padding: '5px 9px' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
