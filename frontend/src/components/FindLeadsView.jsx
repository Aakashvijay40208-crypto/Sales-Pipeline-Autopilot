import React, { useState } from 'react';
import SearchPanel from './SearchPanel';
import LeadsGrid from './LeadsGrid';
import AuditModal from './AuditModal';

export default function FindLeadsView({
  leads,
  filters,
  setFilters,
  sortBy,
  setSortBy,
  backendUrl,
  onSearchComplete,
  onRefresh,
  onOpenLeadWorkspace
}) {
  const [selectedAuditPlaceId, setSelectedAuditPlaceId] = useState(null);

  return (
    <div className="animate-fade-in" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Search & Audit Discovery Panel */}
      <SearchPanel
        backendUrl={backendUrl}
        onSearchStart={() => {}}
        onSearchComplete={onSearchComplete}
      />

      {/* Discovered Leads Results Grid */}
      <LeadsGrid
        leads={leads}
        filters={filters}
        setFilters={setFilters}
        sortBy={sortBy}
        setSortBy={setSortBy}
        backendUrl={backendUrl}
        onSelectLead={(placeId) => setSelectedAuditPlaceId(placeId)}
        onRefresh={onRefresh}
      />

      {/* Technical Website Audit Modal */}
      {selectedAuditPlaceId && (
        <AuditModal
          leadId={selectedAuditPlaceId}
          onClose={() => setSelectedAuditPlaceId(null)}
          backendUrl={backendUrl}
        />
      )}
    </div>
  );
}
