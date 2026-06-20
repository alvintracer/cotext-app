/**
 * PanelResizer — a thin drag handle that resizes a side panel by its left or right edge.
 *
 * Used by NeuralGraphView (2D editor right panel) and NeuralGlobe (3D detail panel) so
 * the user can widen the detail panel for long content. Pointer-captured so dragging
 * outside the handle keeps working.
 */
import { useCallback, useRef } from 'react';

interface Props {
  /** Current panel width in px (controlled). */
  width: number;
  setWidth: (px: number) => void;
  min?: number;
  max?: number;
  /** Which edge the handle is attached to. `left` = drag-left widens (panel sits on the right). */
  side?: 'left' | 'right';
}

export default function PanelResizer({ width, setWidth, min = 240, max = 720, side = 'left' }: Props) {
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, w: width };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    // Left handle: dragging left (negative dx) widens; right handle is the opposite.
    const next = side === 'left' ? startRef.current.w - dx : startRef.current.w + dx;
    setWidth(Math.max(min, Math.min(max, next)));
  }, [setWidth, min, max, side]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    startRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return (
    <div
      className={`panel-resizer panel-resizer-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
