import React, { useEffect, useState, useRef } from 'react';

/**
 * Restrained, professional cursor radial glow.
 *
 * SPEC & ACCESSIBILITY GUARANTEES:
 * 1. Keeps the standard system cursor completely intact.
 * 2. Pure pointer-events: none; will never block clicks, text selection, or drag-and-drop.
 * 3. Disabled on touch-only devices (tablets / mobile phones).
 * 4. Respects prefers-reduced-motion: reduce.
 * 5. Uses lightweight requestAnimationFrame for 60fps performance without CPU overhead.
 */
export default function CursorGlow() {
  const [visible, setVisible] = useState(false);
  const glowRef = useRef(null);
  const targetPos = useRef({ x: -200, y: -200 });
  const currentPos = useRef({ x: -200, y: -200 });
  const animFrameId = useRef(null);

  useEffect(() => {
    // 1. Check if device supports fine hover pointer (disable on touch screens)
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!hasFinePointer) return;

    // 2. Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handleMouseMove = (e) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
      if (!visible) setVisible(true);
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    const handleMouseEnter = () => {
      setVisible(true);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    // Smooth lerp loop
    const render = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.22;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.22;

      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${currentPos.current.x - 110}px, ${currentPos.current.y - 110}px, 0)`;
      }

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [visible]);

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '220px',
        height: '220px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79, 125, 243, 0.08) 0%, rgba(79, 125, 243, 0.02) 45%, transparent 72%)',
        pointerEvents: 'none',
        zIndex: 5,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s ease-out',
        willChange: 'transform, opacity',
      }}
    />
  );
}
