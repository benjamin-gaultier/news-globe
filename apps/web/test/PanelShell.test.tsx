// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PanelShell, SHEET_SNAPS, type PanelShellProps } from '../src/components/PanelShell';

function renderShell(props: Partial<PanelShellProps> = {}) {
  const onClose = vi.fn();
  const onSheetChange = vi.fn();
  const all: PanelShellProps = {
    title: 'France',
    subtitle: 'Top national headlines',
    children: <p>Body</p>,
    sheetKey: 'FR',
    scrollKey: 'FR',
    isMobile: false,
    onClose,
    onSheetChange,
    ...props,
  };
  const view = render(<PanelShell {...all} />);
  const panel = screen.getByRole('complementary', { name: 'France' });
  const header = panel.querySelector('.panel-header')!;
  return {
    ...view,
    panel,
    header,
    onClose,
    onSheetChange,
    rerender: (p: Partial<PanelShellProps>) => view.rerender(<PanelShell {...all} {...p} />),
  };
}

/** Drag the sheet header from y=`from` to y=`to` (screen pixels). */
function drag(header: Element, from: number, to: number) {
  fireEvent.pointerDown(header, { clientY: from, pointerId: 1 });
  fireEvent.pointerMove(header, { clientY: to, pointerId: 1 });
  fireEvent.pointerUp(header, { clientY: to, pointerId: 1 });
}

describe('PanelShell', () => {
  it('is a side panel labelled by its heading on desktop', () => {
    const { panel, onSheetChange } = renderShell();
    expect(panel.getAttribute('style')).toBeNull();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(onSheetChange).toHaveBeenLastCalledWith(0);
  });

  it('closes from its button and from Escape', async () => {
    const { onClose } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Close headlines' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('a');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opens as a half-height sheet on mobile, and a tap on the handle toggles full height', () => {
    const { panel, header, onSheetChange } = renderShell({ isMobile: true });
    expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
    expect(onSheetChange).toHaveBeenLastCalledWith(SHEET_SNAPS.half);

    drag(header, 500, 500);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.full * 100}dvh`);
    expect(onSheetChange).toHaveBeenLastCalledWith(SHEET_SNAPS.full);

    drag(header, 500, 502);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
  });

  it('follows a drag, then snaps to the nearest height or closes when pulled low', () => {
    window.innerHeight = 1000;
    const { panel, header, onClose } = renderShell({ isMobile: true });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ height: 520 } as DOMRect);

    fireEvent.pointerDown(header, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(header, { clientY: 400, pointerId: 1 });
    expect(panel.style.height).toBe('620px');
    expect(panel.className).toContain('dragging');
    // Never taller than the full snap.
    fireEvent.pointerMove(header, { clientY: -1000, pointerId: 1 });
    expect(panel.style.height).toBe('900px');
    fireEvent.pointerUp(header, { clientY: -1000, pointerId: 1 });
    expect(panel.style.height).toBe(`${SHEET_SNAPS.full * 100}dvh`);
    expect(panel.className).not.toContain('dragging');

    // From full height, a drag to 600px is nearer half.
    vi.mocked(panel.getBoundingClientRect).mockReturnValue({ height: 900 } as DOMRect);
    drag(header, 100, 400);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
    expect(onClose).not.toHaveBeenCalled();

    vi.mocked(panel.getBoundingClientRect).mockReturnValue({ height: 520 } as DOMRect);
    drag(header, 500, 900);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens a peek sheet lower, toggles it with full height, and snaps it to any of its heights', () => {
    window.innerHeight = 1000;
    const { panel, header, onClose, onSheetChange } = renderShell({ isMobile: true, peek: true });
    expect(panel.style.height).toBe(`${SHEET_SNAPS.peek * 100}dvh`);
    expect(onSheetChange).toHaveBeenLastCalledWith(SHEET_SNAPS.peek);

    drag(header, 600, 600);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.full * 100}dvh`);
    drag(header, 600, 600);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.peek * 100}dvh`);

    // From peek height, a drag up to 500px is nearest half; down to 250px still peek; below that it closes.
    const at = (height: number) => vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
    at(360);
    drag(header, 640, 500);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
    at(520);
    drag(header, 480, 750);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.peek * 100}dvh`);
    expect(onClose).not.toHaveBeenCalled();
    at(360);
    drag(header, 640, 840);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores drags on desktop', () => {
    const { panel, header, onClose } = renderShell();
    drag(header, 500, 1000);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.getAttribute('style')).toBeNull();
  });

  it('does not take a press on the close button for a tap on the handle', () => {
    const { panel, header } = renderShell({ isMobile: true });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close headlines' }), { clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(header, { clientY: 500, pointerId: 1 });
    expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
  });

  it('starts a new country at half height and scrolls a new view to the top', () => {
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
    const { panel, header, rerender } = renderShell({ isMobile: true });
    drag(header, 500, 500);
    expect(panel.style.height).toBe(`${SHEET_SNAPS.full * 100}dvh`);
    scrollTo.mockClear();

    rerender({ scrollKey: 'FR-BRE' });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(panel.style.height).toBe(`${SHEET_SNAPS.full * 100}dvh`);

    rerender({ sheetKey: 'DE', scrollKey: 'DE' });
    expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
  });

  describe('sideways swipes on phones', () => {
    const swipe = (el: Element, dx: number, dy = 0) => {
      fireEvent.pointerDown(el, { clientX: 200, clientY: 400, pointerId: 2, pointerType: 'touch' });
      fireEvent.pointerUp(el, { clientX: 200 + dx, clientY: 400 + dy, pointerId: 2, pointerType: 'touch' });
    };

    it('reports a swipe on the body or the header, left as next', () => {
      const onSwipe = vi.fn();
      const { panel, header } = renderShell({ isMobile: true, onSwipe });
      expect(panel.classList.contains('panel-swipeable')).toBe(true);
      swipe(screen.getByText('Body'), -120);
      swipe(screen.getByText('Body'), 90, 20);
      expect(onSwipe.mock.calls).toEqual([[1], [-1]]);

      // On the header it is a swipe, not a tap: the sheet stays at half height.
      swipe(header, -100);
      expect(onSwipe).toHaveBeenLastCalledWith(1);
      expect(panel.style.height).toBe(`${SHEET_SNAPS.half * 100}dvh`);
    });

    it('ignores short, mostly vertical and mouse gestures, and desktop', () => {
      const onSwipe = vi.fn();
      renderShell({ isMobile: true, onSwipe });
      const body = screen.getByText('Body');
      swipe(body, -40);
      swipe(body, -100, 80);
      fireEvent.pointerDown(body, { clientX: 200, clientY: 400, pointerId: 3, pointerType: 'mouse' });
      fireEvent.pointerUp(body, { clientX: 50, clientY: 400, pointerId: 3, pointerType: 'mouse' });
      expect(onSwipe).not.toHaveBeenCalled();
    });

    it('is off without a handler or on desktop', () => {
      const onSwipe = vi.fn();
      const { panel } = renderShell({ isMobile: false, onSwipe });
      expect(panel.classList.contains('panel-swipeable')).toBe(false);
      swipe(screen.getByText('Body'), -120);
      expect(onSwipe).not.toHaveBeenCalled();
    });
  });
});
