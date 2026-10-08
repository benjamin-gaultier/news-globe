import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/** Bottom-sheet snap points, as a fraction of the viewport height. */
export const SHEET_SNAPS = { half: 0.52, full: 0.9 } as const;
type Snap = keyof typeof SHEET_SNAPS;

export interface PanelShellProps {
  /** Heading content: crumb, title, subtitle, toggles. The title element needs id="panel-title". */
  heading: ReactNode;
  children: ReactNode;
  /** Changing it starts the sheet at half height again (a new country, the world view). */
  sheetKey: string;
  /** Changing it scrolls the body back to the top (a new country or region). */
  scrollKey: string;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
}

/** The side panel (desktop) or draggable bottom sheet (mobile) that every view opens in. */
export function PanelShell({ heading, children, sheetKey, scrollKey, isMobile, onClose, onSheetChange }: PanelShellProps) {
  const [snap, setSnap] = useState<Snap>('half');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // Live drag state lives in a ref: pointerup can fire before React re-renders after the last move.
  const drag = useRef<{ startY: number; startHeight: number; height: number; moved: boolean } | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => onSheetChange(isMobile ? SHEET_SNAPS[snap] : 0), [snap, isMobile, onSheetChange]);

  useEffect(() => {
    setSnap('half');
  }, [sheetKey]);
  useEffect(() => {
    panelRef.current?.querySelector('.panel-body')?.scrollTo({ top: 0 });
  }, [scrollKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || (e.target as HTMLElement).closest('button')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not fatal: we still get moves while the pointer stays over the header.
    }
    const startHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    drag.current = { startY: e.clientY, startHeight, height: startHeight, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    const max = window.innerHeight * SHEET_SNAPS.full;
    d.height = Math.max(80, Math.min(max, d.startHeight - dy));
    setDragHeight(d.height);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragHeight(null);
    if (!d) return;
    if (!d.moved) {
      // A tap on the handle toggles between the two heights.
      if (e.type === 'pointerup') setSnap((s) => (s === 'half' ? 'full' : 'half'));
      return;
    }
    const fraction = d.height / window.innerHeight;
    if (fraction < SHEET_SNAPS.half * 0.6) onClose();
    else setSnap(fraction > (SHEET_SNAPS.half + SHEET_SNAPS.full) / 2 ? 'full' : 'half');
  };

  const style = isMobile
    ? { height: dragHeight !== null ? `${dragHeight}px` : `${SHEET_SNAPS[snap] * 100}dvh` }
    : undefined;

  return (
    <aside
      ref={panelRef}
      className={`panel${dragHeight !== null ? ' dragging' : ''}`}
      style={style}
      aria-labelledby="panel-title"
    >
      <div
        className="panel-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="panel-heading">{heading}</div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close headlines">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="panel-body">{children}</div>
    </aside>
  );
}
