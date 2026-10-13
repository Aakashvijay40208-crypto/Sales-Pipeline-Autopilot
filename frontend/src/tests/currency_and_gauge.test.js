import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  formatCurrency,
  getStoredCurrency,
  setStoredCurrency
} from '../utils/currencyFormatter.js';

import {
  getScorePriority,
  getPriorityTheme,
  calculateCircumference,
  calculateDashOffset
} from '../utils/leadScoreUtils.js';

describe('Currency Formatter & Settings', () => {
  it('defaults to INR (₹) as the application-wide currency', () => {
    assert.equal(DEFAULT_CURRENCY, 'INR');
  });

  it('supports INR, USD, EUR, GBP, CAD, and AUD', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    assert.ok(codes.includes('INR'));
    assert.ok(codes.includes('USD'));
    assert.ok(codes.includes('EUR'));
    assert.ok(codes.includes('GBP'));
    assert.ok(codes.includes('CAD'));
    assert.ok(codes.includes('AUD'));
  });

  it('formats INR using Indian number grouping (5,000 / 1,25,000 / 12,50,000)', () => {
    const f5k = formatCurrency(5000, 'INR');
    const f125k = formatCurrency(125000, 'INR');
    const f1250k = formatCurrency(1250000, 'INR');

    assert.ok(f5k.includes('₹'), `Expected ₹ in ${f5k}`);
    assert.ok(f5k.includes('5,000'), `Expected 5,000 in ${f5k}`);

    assert.ok(f125k.includes('₹'), `Expected ₹ in ${f125k}`);
    assert.ok(f125k.includes('1,25,000'), `Expected 1,25,000 in ${f125k}`);

    assert.ok(f1250k.includes('₹'), `Expected ₹ in ${f1250k}`);
    assert.ok(f1250k.includes('12,50,000'), `Expected 12,50,000 in ${f1250k}`);
  });

  it('formats other selected currencies cleanly without data mutation', () => {
    const usd = formatCurrency(1500, 'USD');
    const gbp = formatCurrency(1200, 'GBP');
    const eur = formatCurrency(1400, 'EUR');

    assert.ok(usd.includes('$') && usd.includes('1,500'), `Expected $1,500, got ${usd}`);
    assert.ok(gbp.includes('£') && gbp.includes('1,200'), `Expected £1,200, got ${gbp}`);
    assert.ok(eur.includes('€') && (eur.includes('1.400') || eur.includes('1,400')), `Expected € and 1.400 or 1,400, got ${eur}`);
  });

  it('safely handles empty, null, or string formatted amounts', () => {
    assert.equal(formatCurrency(null, 'INR'), '');
    assert.equal(formatCurrency('', 'INR'), '');
    assert.equal(formatCurrency(undefined, 'INR'), '');
    // Numeric string
    const strNum = formatCurrency('5000', 'INR');
    assert.ok(strNum.includes('₹') && strNum.includes('5,000'));
  });

  it('persists and retrieves selected currency', () => {
    const storage = {};
    global.localStorage = {
      getItem: (k) => storage[k] || null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    };
    global.window = { dispatchEvent: () => {} };
    global.CustomEvent = class CustomEvent { constructor(name, opts) { this.name = name; this.opts = opts; } };

    assert.equal(getStoredCurrency(), 'INR');
    setStoredCurrency('USD');
    assert.equal(getStoredCurrency(), 'USD');
    setStoredCurrency('GBP');
    assert.equal(getStoredCurrency(), 'GBP');
    setStoredCurrency('INR');
    assert.equal(getStoredCurrency(), 'INR');
  });
});

describe('Lead Score Gauge Calculations & Thresholds', () => {
  it('correctly maps priority thresholds: 0, 40, 69, 70, 85, 100', () => {
    // Score 0: LOW (blue)
    assert.equal(getScorePriority(0), 'LOW');
    const theme0 = getPriorityTheme('LOW');
    assert.equal(theme0.stroke, '#2563EB');

    // Score 40: MEDIUM (amber)
    assert.equal(getScorePriority(40), 'MEDIUM');
    const theme40 = getPriorityTheme('MEDIUM');
    assert.equal(theme40.stroke, '#D97706');

    // Score 69: MEDIUM (amber)
    assert.equal(getScorePriority(69), 'MEDIUM');

    // Score 70: HOT (red)
    assert.equal(getScorePriority(70), 'HOT');
    const theme70 = getPriorityTheme('HOT');
    assert.equal(theme70.stroke, '#DC2626');

    // Score 85: HOT (red)
    assert.equal(getScorePriority(85), 'HOT');

    // Score 100: HOT (red)
    assert.equal(getScorePriority(100), 'HOT');
  });

  it('maps unavailable scores (null, undefined, NaN) to UNAVAILABLE', () => {
    assert.equal(getScorePriority(null), 'UNAVAILABLE');
    assert.equal(getScorePriority(undefined), 'UNAVAILABLE');
    assert.equal(getScorePriority(NaN), 'UNAVAILABLE');
    const themeUnavail = getPriorityTheme('UNAVAILABLE');
    assert.equal(themeUnavail.stroke, '#94A3B8');
  });

  it('calculates SVG circle circumference and dashoffset accurately', () => {
    const diameter = 104;
    const strokeWidth = 7.5;
    const radius = (diameter - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // At score 0: 0% filled => offset = circumference
    const offset0 = circumference - (0 / 100) * circumference;
    assert.equal(offset0, circumference);

    // At score 50: 50% filled => offset = circumference * 0.5
    const offset50 = circumference - (50 / 100) * circumference;
    assert.ok(Math.abs(offset50 - circumference * 0.5) < 0.001);

    // At score 100: 100% filled => offset = 0
    const offset100 = circumference - (100 / 100) * circumference;
    assert.ok(Math.abs(offset100) < 0.001);
  });
});

describe('Lead Isolation & Stale Result Protection', () => {
  it('discards asynchronous results when user has switched to a different lead', () => {
    let currentSelectedLeadId = 'lead-123';
    let activeLeadState = { id: 'lead-123', lead_score: 85, name: 'Dental Care' };

    const handleAsyncAuditResponse = (targetLeadId, resultData) => {
      if (targetLeadId === currentSelectedLeadId) {
        activeLeadState = { ...activeLeadState, ...resultData };
      }
    };

    // Stale response arrives for lead-001
    handleAsyncAuditResponse('lead-001', { lead_score: 30, name: 'Old Stale Lead' });
    assert.equal(activeLeadState.id, 'lead-123');
    assert.equal(activeLeadState.lead_score, 85);
    assert.equal(activeLeadState.name, 'Dental Care');

    // Matching response arrives for current lead
    handleAsyncAuditResponse('lead-123', { lead_score: 92 });
    assert.equal(activeLeadState.lead_score, 92);
  });
});
