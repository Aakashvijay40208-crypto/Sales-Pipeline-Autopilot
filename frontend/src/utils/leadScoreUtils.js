/**
 * Lead score priority thresholds, accessible styling tokens, and gauge circular math
 *
 * Thresholds:
 * - HOT: 70–100 (Red)
 * - MEDIUM: 40–69 (Amber)
 * - LOW: 0–39 (Blue)
 */

export function getScorePriority(score) {
  if (score === null || score === undefined || isNaN(score)) return 'UNAVAILABLE';
  const s = Number(score);
  if (s >= 70) return 'HOT';
  if (s >= 40) return 'MEDIUM';
  return 'LOW';
}

export function getPriorityTheme(priority) {
  switch (priority) {
    case 'HOT':
      return {
        stroke: '#DC2626', // accessible red-600
        glow: 'rgba(220, 38, 38, 0.20)',
        trackBg: 'rgba(254, 242, 242, 0.8)',
        textColor: '#B91C1C',
        badgeBg: '#FEE2E2',
        badgeBorder: '#FCA5A5',
        badgeText: '#991B1B',
        label: 'HOT'
      };
    case 'MEDIUM':
      return {
        stroke: '#D97706', // accessible amber-600
        glow: 'rgba(217, 119, 6, 0.20)',
        trackBg: 'rgba(255, 251, 235, 0.8)',
        textColor: '#B45309',
        badgeBg: '#FEF3C7',
        badgeBorder: '#FCD34D',
        badgeText: '#92400E',
        label: 'MEDIUM'
      };
    case 'LOW':
      return {
        stroke: '#2563EB', // accessible blue-600
        glow: 'rgba(37, 99, 235, 0.20)',
        trackBg: 'rgba(239, 246, 255, 0.8)',
        textColor: '#1D4ED8',
        badgeBg: '#DBEAFE',
        badgeBorder: '#93C5FD',
        badgeText: '#1E40AF',
        label: 'LOW'
      };
    default:
      return {
        stroke: '#94A3B8', // slate-400
        glow: 'transparent',
        trackBg: '#F1F5F9',
        textColor: '#64748B',
        badgeBg: '#F1F5F9',
        badgeBorder: '#CBD5E1',
        badgeText: '#475569',
        label: 'N/A'
      };
  }
}

export function calculateCircumference(diameter, strokeWidth) {
  const radius = (diameter - strokeWidth) / 2;
  return 2 * Math.PI * radius;
}

export function calculateDashOffset(score, circumference) {
  if (score === null || score === undefined || isNaN(score)) return circumference;
  const clamped = Math.max(0, Math.min(100, Number(score)));
  return circumference - (clamped / 100) * circumference;
}
