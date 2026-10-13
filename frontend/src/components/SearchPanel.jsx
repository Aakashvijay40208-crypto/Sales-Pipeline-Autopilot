import React, { useState, useEffect } from 'react';
import { Search, Loader2, Sparkles, AlertCircle, Compass } from 'lucide-react';

const RADIUS_PRESETS = [2, 5, 10, 25];

export default function SearchPanel({ onSearchComplete, onSearchStart, backendUrl }) {
  const [category, setCategory] = useState('Dentists');
  const [city, setCity] = useState('Austin');
  const [area, setArea] = useState('Downtown');
  const [radiusKm, setRadiusKm] = useState('5');
  const [limit, setLimit] = useState(5);
  
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');

  // Polling for search progress
  useEffect(() => {
    if (!searchId || !loading) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${backendUrl}/api/search/status/${searchId}`);
        if (!response.ok) throw new Error("Failed to fetch search progress.");
        
        const data = await response.json();
        setProgress(data.progress || 0);
        setTotal(data.total || 0);
        setStatusMsg(data.current_lead || 'Running Playwright website audits & scoring...');

        if (data.status === 'completed') {
          setLoading(false);
          setSearchId(null);
          clearInterval(interval);
          if (data.total === 0) {
            setError(data.current_lead || 'No businesses found for this query within the search radius.');
          } else {
            if (onSearchComplete) onSearchComplete(searchId);
          }
        } else if (data.status === 'failed') {
          setLoading(false);
          setSearchId(null);
          setError(data.current_lead || 'Search pipeline encountered an error.');
          clearInterval(interval);
          if (onSearchComplete) onSearchComplete(searchId);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [searchId, loading]);

  const validateInput = () => {
    if (!category.trim()) return "Business category is required.";
    if (!city.trim()) return "City is required.";

    const parsedRad = parseFloat(radiusKm);
    if (isNaN(parsedRad) || radiusKm.trim() === '') {
      return "Please enter a valid numeric search radius in kilometres (e.g. 5, 7.5, 15).";
    }
    if (parsedRad <= 0) {
      return "Search radius must be greater than 0 km.";
    }
    if (parsedRad < 0.5) {
      return "Minimum search radius is 0.5 km.";
    }
    if (parsedRad > 100) {
      return "Maximum search radius is 100 km.";
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    const parsedRadius = parseFloat(radiusKm);
    setError('');
    setLoading(true);
    setProgress(0);
    setTotal(0);
    setStatusMsg(`Initializing lead discovery for ${category} within ${parsedRadius} km of ${city}...`);
    if (onSearchStart) onSearchStart();

    try {
      const response = await fetch(`${backendUrl}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category.trim(),
          city: city.trim(),
          area: area.trim(),
          radius: parsedRadius,
          radius_km: parsedRadius,
          limit: Number(limit)
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to trigger lead search.");
      }

      const data = await response.json();
      setSearchId(data.search_id);
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('Failed to fetch')) {
        setError(`Cannot connect to backend server at ${backendUrl}. Please ensure the Flask backend is running on port 5000.`);
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  const percent = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="card-surface" style={{ padding: '24px', borderRadius: '14px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '9px',
            backgroundColor: 'var(--surface-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)'
          }}>
            <Search size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Find & Analyze Leads
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Discover local businesses, audit their technical presence, and enroll qualified prospects into your CRM.
            </p>
          </div>
        </div>
      </div>

      {!loading ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            
            {/* Business Category */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Business Category *
              </label>
              <input 
                type="text" 
                placeholder="e.g. Dentists, Orthodontists, HVAC" 
                value={category} 
                onChange={(e) => setCategory(e.target.value)} 
                required
              />
            </div>

            {/* City */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                City *
              </label>
              <input 
                type="text" 
                placeholder="e.g. Austin, Seattle, Dallas" 
                value={city} 
                onChange={(e) => setCity(e.target.value)} 
                required
              />
            </div>

            {/* Area / Neighborhood */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Area / Neighborhood (Optional)
              </label>
              <input 
                type="text" 
                placeholder="e.g. Downtown, Westlake" 
                value={area} 
                onChange={(e) => setArea(e.target.value)} 
              />
            </div>

            {/* Custom Search Radius in Kilometres */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Search Radius
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="100"
                  placeholder="5" 
                  value={radiusKm} 
                  onChange={(e) => setRadiusKm(e.target.value)}
                  style={{ paddingRight: '44px' }}
                />
                <span style={{
                  position: 'absolute',
                  right: '12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none'
                }}>
                  km
                </span>
              </div>
              {/* Radius Quick Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quick:</span>
                {RADIUS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRadiusKm(String(preset))}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      backgroundColor: parseFloat(radiusKm) === preset ? 'var(--surface-soft)' : '#FFFFFF',
                      color: parseFloat(radiusKm) === preset ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: parseFloat(radiusKm) === preset ? 700 : 500,
                      fontSize: '11px',
                      padding: '2px 7px',
                      cursor: 'pointer'
                    }}
                  >
                    {preset} km
                  </button>
                ))}
              </div>
            </div>

            {/* Max Results Count */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Max Leads
              </label>
              <select 
                value={limit} 
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={3}>3 leads</option>
                <option value={5}>5 leads (Recommended)</option>
                <option value={10}>10 leads</option>
                <option value={20}>20 leads</option>
              </select>
            </div>

          </div>

          {error && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              color: 'var(--danger)', 
              fontSize: '13px',
              backgroundColor: '#FEECEB',
              border: '1px solid rgba(217, 87, 87, 0.25)',
              padding: '10px 14px',
              borderRadius: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Radius: <strong>{radiusKm || '5'} km</strong> • Engine: Google Maps & Playwright
            </span>
            <button 
              type="submit" 
              className="btn-primary" 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                fontSize: '14px',
                fontWeight: 700
              }}
            >
              <Sparkles size={16} />
              Analyze & Find Leads
            </button>
          </div>

        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Loader2 size={18} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--primary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Discovering & Auditing Prospects ({progress} / {total || '...'})
              </span>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)' }}>{percent}%</span>
          </div>
          
          {/* Progress Bar */}
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: 'var(--surface-soft)', 
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--border)'
          }}>
            <div style={{ 
              width: `${percent}%`, 
              height: '100%', 
              backgroundColor: 'var(--primary)', 
              borderRadius: '6px',
              transition: 'width 0.4s ease'
            }} />
          </div>

          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-secondary)', 
            backgroundColor: 'var(--page-background)',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            fontFamily: 'monospace'
          }}>
            {statusMsg}
          </div>
        </div>
      )}
    </div>
  );
}
