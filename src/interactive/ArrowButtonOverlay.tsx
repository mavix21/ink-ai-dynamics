// ArrowButtonOverlay — renders interactive Arrow.js buttons on top of the
// canvas for detected button gestures (rectangle + text inside).

import { useEffect, useRef } from 'react';
import { html } from '@arrow-js/core';
import type { BoundingBox } from '../types/primitives';
import type { Viewport } from '../canvas/ViewportManager';
import { canvasToScreen } from '../canvas/ViewportManager';

export interface ArrowButtonData {
  id: string;
  text: string;
  bounds: BoundingBox; // canvas-space
}

export interface ArrowButtonOverlayProps {
  buttons: ArrowButtonData[];
  viewport: Viewport;
  onRemoveButton?: (id: string) => void;
}

export function ArrowButtonOverlay({ buttons, viewport, onRemoveButton }: ArrowButtonOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const buttonKey = buttons.map((b) => b.id).join(',');

  // Mount / unmount Arrow.js buttons
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentIds = new Set(buttons.map((b) => b.id));
    const mounted = mountedRef.current;

    // Remove buttons that no longer exist
    for (const [id, el] of mounted) {
      if (!currentIds.has(id)) {
        el.remove();
        mounted.delete(id);
      }
    }

    // Create new buttons
    for (const btn of buttons) {
      if (!mounted.has(btn.id)) {
        const wrapper = document.createElement('div');
        wrapper.dataset.arrowBtnId = btn.id;
        container.appendChild(wrapper);

        const btnStyle = [
          'all:unset', 'box-sizing:border-box', 'width:100%', 'height:100%',
          'display:inline-flex', 'align-items:center', 'justify-content:center',
          'white-space:nowrap', 'border-radius:6px', 'font-size:14px', 'font-weight:500',
          'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif',
          'line-height:1', 'pointer-events:auto', 'cursor:pointer', 'user-select:none',
          'border:1px solid rgb(59 130 246)', 'background-color:rgb(59 130 246)',
          'color:white', 'box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.05)',
          'transition:all 150ms cubic-bezier(0.4,0,0.2,1)',
        ].join(';');

        const label = btn.text;
        const btnId = btn.id;

        // Arrow.js button
        html`<button style="${btnStyle}" @pointerdown="${(e: Event) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.95)'; }}" @pointerup="${(e: Event) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}" @pointerleave="${(e: Event) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}" @click="${() => console.log(`[ArrowButton] clicked: "${label}"`)}" @mouseenter="${(e: Event) => { const t = e.currentTarget as HTMLElement; t.style.backgroundColor = 'rgb(37 99 235)'; t.style.borderColor = 'rgb(37 99 235)'; }}" @mouseleave="${(e: Event) => { const t = e.currentTarget as HTMLElement; t.style.backgroundColor = 'rgb(59 130 246)'; t.style.borderColor = 'rgb(59 130 246)'; }}">${label}</button>`(wrapper);

        // Close (×) button — plain DOM, shown on hover
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        Object.assign(closeBtn.style, {
          position: 'absolute', top: '-8px', right: '-8px',
          width: '18px', height: '18px', borderRadius: '50%',
          border: '1px solid rgb(219 234 254)', background: 'rgb(219 234 254)',
          color: 'rgb(30 64 175)', fontSize: '12px', lineHeight: '1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', opacity: '0', pointerEvents: 'none',
          transition: 'opacity 150ms ease, background 150ms ease',
          zIndex: '51', padding: '0',
        });
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = 'rgb(191 219 254)';
          closeBtn.style.color = 'rgb(29 78 216)';
          closeBtn.style.borderColor = 'rgb(147 197 253)';
        });
        closeBtn.addEventListener('mouseleave', () => {
          closeBtn.style.background = 'rgb(219 234 254)';
          closeBtn.style.color = 'rgb(30 64 175)';
          closeBtn.style.borderColor = 'rgb(219 234 254)';
        });
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onRemoveButton?.(btnId);
        });
        wrapper.style.position = 'relative';
        wrapper.appendChild(closeBtn);

        // Show/hide close button on wrapper hover
        wrapper.addEventListener('mouseenter', () => {
          closeBtn.style.opacity = '1';
          closeBtn.style.pointerEvents = 'auto';
        });
        wrapper.addEventListener('mouseleave', () => {
          closeBtn.style.opacity = '0';
          closeBtn.style.pointerEvents = 'none';
        });

        mounted.set(btn.id, wrapper);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buttonKey]);

  // Update positions every render (viewport or element move)
  const mounted = mountedRef.current;
  for (const btn of buttons) {
    const wrapper = mounted.get(btn.id);
    if (!wrapper) continue;

    const screenTopLeft = canvasToScreen(viewport, { x: btn.bounds.left, y: btn.bounds.top });
    const screenW = (btn.bounds.right - btn.bounds.left) * viewport.zoom;
    const screenH = (btn.bounds.bottom - btn.bounds.top) * viewport.zoom;

    wrapper.style.position = 'absolute';
    wrapper.style.left = `${screenTopLeft.x}px`;
    wrapper.style.top = `${screenTopLeft.y}px`;
    wrapper.style.width = `${screenW}px`;
    wrapper.style.height = `${screenH}px`;
    wrapper.style.zIndex = '50';
    wrapper.style.pointerEvents = 'auto';
  }

  // Cleanup on unmount
  useEffect(() => {
    const mounted = mountedRef.current;
    return () => {
      mounted.forEach((el) => el.remove());
      mounted.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    />
  );
}
