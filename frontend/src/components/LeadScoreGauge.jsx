import React, { useState, useEffect, useRef } from 'react';

import {
  getScorePriority,
  getPriorityTheme,
  calculateCircumference,
  calculateDashOffset
} from '../utils/leadScoreUtils.js';

export {
  getScorePriority,
  getPriorityTheme,
  calculateCircumference,
  calculateDashOffset
};

/**
 * Animated, Colour-Coded Lead Score Circular Gauge
 *
 * @param {number|null|undefined} props.score - Lead score (0 to 100)
 * @param {string} [props.priority] - Optional priority override ('HOT' | 'MEDIUM' | 'LOW')
 * @param {'compact'|'medium'|'large'} [props.size='large'] - Display size variant
 * @param {boolean} [props.loading=false] - Whether audit score is currently loading
 * @param {boolean} [props.showPriorityBadge=false] - Whether to render priority badge alongside/below
 * @param {string} [props.className=''] - Additional CSS class
 */
export default function LeadScoreGauge({
  score,
  priority: explicitPriority,
  size = 'large',
  loading = false,
  showPriorityBadge = false,
  className = ''
}) {
  // Normalize numeric score
  const isAvailable = score !== null && score !== undefined && !isNaN(score);
  const targetScore = isAvailable ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;
  const priority = explicitPriority || getScorePriority(targetScore);
  const theme = getPriorityTheme(priority);

  // Dimension settings per size variant
  const sizeMap = {
    compact: { diameter: 44, strokeWidth: 4, scoreFontSize: 13, maxFontSize: 9, labelGap: 6 },
    medium: { diameter: 68, strokeWidth: 5.5, scoreFontSize: 20, maxFontSize: 11, labelGap: 8 },
    large: { diameter: 104, strokeWidth: 7.5, scoreFontSize: 30, maxFontSize: 12, labelGap: 10 }
  };
  const config = sizeMap[size] || sizeMap.large;
  const { diameter, strokeWidth, scoreFontSize, maxFontSize } = config;

  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Reduced motion detection
  const prefersReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animation states
  const [animatedScore, setAnimatedScore] = useState(prefersReducedMotion ? (targetScore || 0) : 0);
  const [dashOffset, setDashOffset] = useState(circumference);
  const animRef = useRef(null);

  // Trigger animation whenever score or loading changes
  useEffect(() => {
    if (loading || !isAvailable) {
      setAnimatedScore(0);
      setDashOffset(circumference);
      return;
    }

    if (prefersReducedMotion) {
      setAnimatedScore(targetScore);
      const finalOffset = circumference - (targetScore / 100) * circumference;
      setDashOffset(finalOffset);
      return;
    }

    // Reset to 0 briefly for smooth lead transitions
    setDashOffset(circumference);
    setAnimatedScore(0);

    const startTime = performance.now();
    const duration = 850; // ms

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic: 1 - pow(1 - progress, 3)
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(ease * targetScore);

      setAnimatedScore(current);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        setAnimatedScore(targetScore);
      }
    };

    // Trigger stroke transition after paint
    const timer = setTimeout(() => {
      const finalOffset = circumference - (targetScore / 100) * circumference;
      setDashOffset(finalOffset);
      animRef.current = requestAnimationFrame(step);
    }, 40);

    return () => {
      clearTimeout(timer);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [targetScore, loading, isAvailable, circumference, prefersReducedMotion]);

  // Loading State
  if (loading) {
    return (
      <div
        className={`lead-score-gauge loading ${className}`}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: config.labelGap
        }}
      >
        <div style={{ position: 'relative', width: diameter, height: diameter }}>
          <svg
            width={diameter}
            height={diameter}
            viewBox={`0 0 ${diameter} ${diameter}`}
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx={diameter / 2}
              cy={diameter / 2}
              r={radius}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={diameter / 2}
              cy={diameter / 2}
              r={radius}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.75}
              strokeLinecap="round"
              style={{
                transformOrigin: '50% 50%',
                animation: 'gaugeSpin 1.2s linear infinite'
              }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: `${scoreFontSize * 0.7}px`,
              fontWeight: 700,
              color: 'var(--text-muted, #64748B)'
            }}
          >
            ···
          </div>
        </div>
        {showPriorityBadge && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              fontWeight: 600
            }}
          >
            ANALYZING...
          </span>
        )}
        <style>{`
          @keyframes gaugeSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Unavailable State
  if (!isAvailable) {
    return (
      <div
        className={`lead-score-gauge unavailable ${className}`}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: config.labelGap
        }}
        title="Lead score unavailable or not yet audited"
      >
        <div style={{ position: 'relative', width: diameter, height: diameter }}>
          <svg
            width={diameter}
            height={diameter}
            viewBox={`0 0 ${diameter} ${diameter}`}
          >
            <circle
              cx={diameter / 2}
              cy={diameter / 2}
              r={radius}
              fill="#F8FAFC"
              stroke="#E2E8F0"
              strokeWidth={strokeWidth}
              strokeDasharray="4 3"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8'
            }}
          >
            <span style={{ fontSize: `${scoreFontSize * 0.7}px`, fontWeight: 700, lineHeight: 1 }}>
              —
            </span>
          </div>
        </div>
        {showPriorityBadge && (
          <span
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              fontWeight: 600
            }}
          >
            NO AUDIT
          </span>
        )}
      </div>
    );
  }

  // Main Rendered Gauge with Animated Arc & Numeric Center
  return (
    <div
      className={`lead-score-gauge ${priority.toLowerCase()} ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: config.labelGap
      }}
      title={`Lead Score: ${targetScore}/100 • Priority: ${priority}`}
    >
      <div
        style={{
          position: 'relative',
          width: diameter,
          height: diameter,
          borderRadius: '50%',
          boxShadow: `0 0 16px ${theme.glow}`
        }}
      >
        <svg
          width={diameter}
          height={diameter}
          viewBox={`0 0 ${diameter} ${diameter}`}
          style={{ transform: 'rotate(-90deg)', display: 'block' }}
        >
          {/* Subtle Neutral Track Behind Progress Arc */}
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill={theme.trackBg}
            stroke="#E2E8F0"
            strokeWidth={strokeWidth}
          />
          {/* Animated Colour-Coded Progress Arc */}
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={theme.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{
              transition: prefersReducedMotion
                ? 'none'
                : 'stroke-dashoffset 850ms cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
          />
        </svg>

        {/* Prominent Score Number in Center with /100 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              fontSize: `${scoreFontSize}px`,
              fontWeight: 800,
              fontFamily: 'var(--font-display, "Outfit", sans-serif)',
              color: theme.textColor,
              lineHeight: 1,
              letterSpacing: '-0.02em'
            }}
          >
            {animatedScore}
          </div>
          {size !== 'compact' && (
            <div
              style={{
                fontSize: `${maxFontSize}px`,
                fontWeight: 600,
                color: 'var(--text-muted, #64748B)',
                lineHeight: 1,
                marginTop: '2px',
                opacity: 0.85
              }}
            >
              /100
            </div>
          )}
        </div>
      </div>

      {/* Optional Synchronized Priority Badge */}
      {showPriorityBadge && (
        <span
          style={{
            fontSize: size === 'compact' ? '10px' : '11px',
            fontWeight: 700,
            padding: size === 'compact' ? '2px 6px' : '3px 10px',
            borderRadius: '12px',
            backgroundColor: theme.badgeBg,
            border: `1px solid ${theme.badgeBorder}`,
            color: theme.badgeText,
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}
        >
          {theme.label} OPPORTUNITY
        </span>
      )}
    </div>
  );
}
