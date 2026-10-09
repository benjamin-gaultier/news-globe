import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/** Bottom-sheet snap points, as a fraction of the viewport height. */
export const SHEET_SNAPS = { half: 0.52, full: 0.9 } as const;
/** A sideways swipe: at least this far, and mostly sideways. */
const SWIPE_MIN_PX = 60;
const isSwipe = (dx: number, dy: number) => Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 2 * Math.abs(dy);

/** Swallows the click that follows a swipe, so a swipe over a headline doesn't open it. */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  // The click, if any, comes right after the pointerup: the next touch means none came, so don't eat its click.
  const done = () => {
    window.removeEventListener('click', stop, { capture: true });
    window.removeEventListener('pointerdown', done, { capture: true });
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  window.addEventListener('pointerdown', done, { capture: true, once: true });
}
type Snap = keyof typeof SHEET_SNAPS;

export interface PanelShellProps {
  /** A link back up a level, above the title ("‹ France"). */
  crumb?: { label: string; onClick: () => void };
  /** The panel's name, as its heading; it also labels the panel. */
  title: ReactNode;
  titleClassName?: string;
  /** One line under the title. */
  subtitle: ReactNode;
  /** Controls under the subtitle (the headline language toggle). */
  controls?: ReactNode;
  children: ReactNode;
  /** A bar between the heading and the scrolling body (the history timeline). */
  toolbar?: ReactNode;
  /** false: no slide-in, when the same place's panel only switched between live and History. */
  animate?: boolean;
  /** Phones: a sideways swipe on the sheet; 1 is a swipe to the left (next), -1 to the right (previous). */
  onSwipe?: (direction: 1 | -1) => void;
  /** Changing it starts the sheet at half height again (a new country, the world view). */
  sheetKey: string;
  /** Changing it scrolls the body back to the top (a new country or region). */
  scrollKey: string;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
}

/** The side panel (desktop) or draggable bottom sheet (mobile) that every view opens in. */
export function PanelShell({
  crumb,
  title,
  titleClassName,
  subtitle,
  controls,
  children,
  toolbar,
  animate = true,
  onSwipe,
  sheetKey,
  scrollKey,
  isMobile,
  onClose,
  onSheetChange,
}: PanelShellProps) {
  const [snap, setSnap] = useState<Snap>('half');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // Live drag state lives in a ref: pointerup can fire before React re-renders after the last move.
  const drag = useRef<{ startX: number; startY: number; startHeight: number; height: number; moved: boolean } | null>(null);
  // A touch on the body that may turn into a sideways swipe.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipeable = isMobile && !!onSwipe;
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => onSheetChange(isMobile ? SHEET_SNAPS[snap] : 0), [snap, isMobile, onSheetChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the key changes, by design.
  useEffect(() => {
    setSnap('half');
  }, [sheetKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the key changes, by design.
  useEffect(() => {
    panelRef.current?.querySelector('.panel-body')?.scrollTo({ top: 0 });
  }, [scrollKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Buttons and fields in the header (close, crumb, the search box) stay usable: no drag from them.
    if (!isMobile || (e.target as HTMLElement).closest('button, input')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not fatal: we still get moves while the pointer stays over the header.
    }
    const startHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    drag.current = { startX: e.clientX, startY: e.clientY, startHeight, height: startHeight, moved: false };
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
    if (swipeable && e.type === 'pointerup' && isSwipe(e.clientX - d.startX, e.clientY - d.startY)) {
      onSwipe!(e.clientX < d.startX ? 1 : -1);
      return;
    }
    if (!d.moved) {
      // A tap on the handle toggles between the two heights.
      if (e.type === 'pointerup') setSnap((s) => (s === 'half' ? 'full' : 'half'));
      return;
    }
    const fraction = d.height / window.innerHeight;
    if (fraction < SHEET_SNAPS.half * 0.6) onClose();
    else setSnap(fraction > (SHEET_SNAPS.half + SHEET_SNAPS.full) / 2 ? 'full' : 'half');
  };

  const onBodyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Rows that scroll sideways themselves keep their gesture.
    if (!swipeable || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('.region-picker, .history-bar, input')) {
      touch.current = null;
      return;
    }
    touch.current = { x: e.clientX, y: e.clientY };
  };
  const onBodyPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    touch.current = null;
    if (!t || !isSwipe(e.clientX - t.x, e.clientY - t.y)) return;
    swallowNextClick();
    onSwipe!(e.clientX < t.x ? 1 : -1);
  };

  const style = isMobile
    ? { height: dragHeight !== null ? `${dragHeight}px` : `${SHEET_SNAPS[snap] * 100}dvh` }
    : undefined;

  return (
    <aside
      ref={panelRef}
      className={`panel${dragHeight !== null ? ' dragging' : ''}${animate ? '' : ' panel-quiet'}${swipeable ? ' panel-swipeable' : ''}`}
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
        <div className="panel-heading">
          {crumb && (
            <button type="button" className="crumb" onClick={crumb.onClick}>
              ‹ {crumb.label}
            </button>
          )}
          <h2 id="panel-title" className={titleClassName} dir="auto">
            {title}
          </h2>
          <p className="panel-sub" dir="auto">
            {subtitle}
          </p>
          {controls}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close headlines">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {toolbar}
      <div
        className="panel-body"
        onPointerDown={onBodyPointerDown}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={() => {
          touch.current = null;
        }}
      >
        {children}
      </div>
    </aside>
  );
}
