import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Point = { x: number; y: number };
type Anchor = { world: Point; screen: Point };
type Pinch = { ids: number[]; distance: number; zoom: number; world: Point };
const boundedZoom = (value: number) => Math.max(10, Math.min(800, Math.round(value * 10) / 10));

// Local camera only. Neither browser zoom nor saved game data belongs here.
export function useMapCamera(scroll: RefObject<HTMLDivElement | null>, grid: RefObject<HTMLDivElement | null>, geometryKey: string, cancelDrag: () => void) {
  const [camera, setCamera] = useState({ zoom: 100, revision: 0 });
  const desiredZoom = useRef(100), pending = useRef<Anchor | null>(null), resetPending = useRef(false);
  const pinch = useRef<Pinch | null>(null), touchSequence = useRef(false), suppressTouchClick = useRef(false);
  const hovered = useRef(false), geometry = useRef(geometryKey), cancel = useRef(cancelDrag);
  cancel.current = cancelDrag;

  function center(): Point {
    const el = scroll.current!, rect = el.getBoundingClientRect();
    return { x: rect.left + el.clientWidth / 2, y: rect.top + el.clientHeight / 2 };
  }
  function worldAt(point: Point): Point | null {
    const first = grid.current?.querySelector<HTMLElement>('[data-cell="0-0"]')?.getBoundingClientRect();
    return first && first.width > 0 && first.height > 0 ? { x: (point.x - first.left) / first.width, y: (point.y - first.top) / first.height } : null;
  }
  function zoomAt(value: number, screen = center(), world = worldAt(screen)) {
    if (!world || !Number.isFinite(value)) return;
    cancel.current(); resetPending.current = false;
    pending.current = { world, screen }; desiredZoom.current = boundedZoom(value);
    // A moving pinch centroid also pans at constant distance or at a zoom limit.
    setCamera(old => ({ zoom: desiredZoom.current, revision: old.revision + 1 }));
  }
  function step(factor: number) { zoomAt(desiredZoom.current * factor); }
  function reset() {
    cancel.current(); pinch.current = null; pending.current = null; resetPending.current = true; desiredZoom.current = 100;
    setCamera(old => ({ zoom: 100, revision: old.revision + 1 }));
  }

  useLayoutEffect(() => {
    if (geometry.current !== geometryKey) {
      geometry.current = geometryKey; pending.current = null; pinch.current = null; cancel.current();
    }
    const area = scroll.current;
    if (!area) return;
    if (resetPending.current) { area.scrollLeft = 0; area.scrollTop = 0; resetPending.current = false; pending.current = null; return; }
    const anchor = pending.current; pending.current = null;
    const first = grid.current?.querySelector<HTMLElement>('[data-cell="0-0"]')?.getBoundingClientRect();
    if (anchor && first) {
      area.scrollLeft += first.left + anchor.world.x * first.width - anchor.screen.x;
      area.scrollTop += first.top + anchor.world.y * first.height - anchor.screen.y;
    }
  }, [camera.revision, geometryKey, scroll, grid]);

  // Stable native listeners are needed to cancel browser wheel/pinch defaults.
  const latest = useRef({ zoomAt, step, reset, worldAt }); latest.current = { zoomAt, step, reset, worldAt };
  useLayoutEffect(() => {
    const area = scroll.current!;
    function wheel(e: WheelEvent) {
      if (!e.ctrlKey || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? area.clientHeight : 1);
      latest.current.zoomAt(desiredZoom.current * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002), { x: e.clientX, y: e.clientY });
    }
    function key(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector('dialog[open]')) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,select,textarea,[role="textbox"]'))) return;
      if (!hovered.current && !area.closest('.arena-panel')?.contains(document.activeElement)) return;
      const plus = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
      const minus = e.key === '-' || e.code === 'NumpadSubtract';
      if (!plus && !minus && e.key !== '0') return;
      e.preventDefault(); if (e.key === '0') latest.current.reset(); else latest.current.step(plus ? 1.25 : 1 / 1.25);
    }
    function touches(e: TouchEvent) { return Array.from(e.touches).filter(t => t.target instanceof Node && area.contains(t.target)); }
    function begin(e: TouchEvent) {
      const active = touches(e); if (active.length < 2) return;
      if (e.cancelable) e.preventDefault();
      touchSequence.current = true; suppressTouchClick.current = true; cancel.current();
      const [a, b] = active, screen = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }, world = latest.current.worldAt(screen);
      if (world) pinch.current = { ids: [a.identifier, b.identifier], distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), zoom: desiredZoom.current, world };
    }
    function move(e: TouchEvent) {
      if (!touchSequence.current) return;
      if (e.cancelable) e.preventDefault();
      const p = pinch.current, active = touches(e); if (!p) return;
      const a = active.find(t => t.identifier === p.ids[0]), b = active.find(t => t.identifier === p.ids[1]); if (!a || !b) return;
      latest.current.zoomAt(p.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / p.distance, { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }, p.world);
    }
    function end(e: TouchEvent) {
      if (!touchSequence.current) return;
      if (e.cancelable) e.preventDefault();
      const active = touches(e);
      if (active.length < 2) pinch.current = null;
      if (!active.length) touchSequence.current = false;
      // Keep click suppression until a genuinely new pointerdown, not final touchend.
    }
    function pointerStart() { if (!touchSequence.current) suppressTouchClick.current = false; }
    function click(e: MouseEvent) { if (suppressTouchClick.current && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); } }
    const enter = () => { hovered.current = true; }, leave = () => { hovered.current = false; };
    area.addEventListener('wheel', wheel, { passive: false });
    area.addEventListener('touchstart', begin, { passive: false, capture: true });
    area.addEventListener('touchmove', move, { passive: false, capture: true });
    area.addEventListener('touchend', end, { passive: false, capture: true });
    area.addEventListener('touchcancel', end, { passive: false, capture: true });
    area.addEventListener('pointerdown', pointerStart, true); area.addEventListener('click', click, true);
    area.addEventListener('pointerenter', enter); area.addEventListener('pointerleave', leave); window.addEventListener('keydown', key);
    return () => {
      area.removeEventListener('wheel', wheel); area.removeEventListener('touchstart', begin, true); area.removeEventListener('touchmove', move, true);
      area.removeEventListener('touchend', end, true); area.removeEventListener('touchcancel', end, true);
      area.removeEventListener('pointerdown', pointerStart, true); area.removeEventListener('click', click, true);
      area.removeEventListener('pointerenter', enter); area.removeEventListener('pointerleave', leave); window.removeEventListener('keydown', key);
    };
  }, [scroll]);
  return { zoom: camera.zoom, step, reset, blocksPointer: () => touchSequence.current };
}
