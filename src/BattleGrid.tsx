import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { characterInitials, columnName, fitCellSize, type Board, type Character } from './domain';
import { Grid2X2, Minus, Plus } from 'lucide-react';
import { useMapCamera } from './useMapCamera';

function pieceStyle(size: number): CSSProperties {
  return { '--cell-size': `${size}px`, '--token-font': `${Math.min(20, size * 0.32)}px`, '--token-gap': `${Math.min(3, size * 0.045)}px`, '--bar-size': `${Math.min(4, size * 0.05)}px`, '--cell-pad': `${Math.min(6, size * 0.07)}px`, '--cell-border': `${Math.min(1, size * 0.035)}px` } as CSSProperties;
}

function Piece({ c }: { c: Character }) {
  return <span className="token-piece" data-token={c.id}><span className={`token ${c.hp === 0 ? 'fallen' : ''}`}><span>{characterInitials(c.name)}</span></span><span className="token-stat hp" role="progressbar" aria-label={`${c.name} HP`} aria-valuemin={0} aria-valuemax={c.maxHp} aria-valuenow={c.hp}><i style={{ width: `${c.hp / c.maxHp * 100}%` }}/></span><span className={`token-stat oh ${c.oh > c.maxOh ? 'overheat' : ''}`} role="progressbar" aria-label={`${c.name} OH`} aria-valuemin={0} aria-valuemax={Math.max(c.maxOh, c.oh, 1)} aria-valuenow={c.oh}><i style={{ width: `${c.maxOh ? Math.min(100, c.oh / c.maxOh * 100) : 0}%` }}/></span></span>;
}
type Drag = { id: string; pointer: number; owner: HTMLButtonElement; startX: number; startY: number; originX: number; originY: number; active: boolean };
export function BattleGrid({ board, selected, moving, chooseCell, move, notify }: {
  board: Board; selected: string | null; moving: string | null;
  chooseCell(x: number, y: number): void; move(id: string, x: number, y: number): void; notify(message: string): void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null), suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const [focus, setFocus] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  function cancelDrag() { const d = drag.current; if (d) { drag.current = null; suppressClick.current = true; if (d.owner.hasPointerCapture(d.pointer)) d.owner.releasePointerCapture(d.pointer); } setGhost(null); }
  const camera = useMapCamera(scroll, grid, `${viewport.width}:${viewport.height}:${board.cols}:${board.rows}`, cancelDrag);
  const { zoom } = camera;
  const cellSize = fitCellSize(viewport.width, viewport.height, board.cols, board.rows) * zoom / 100;
  const axis = Math.min(24, cellSize * 0.5);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setViewport(old => Math.abs(old.width - width) < 0.1 && Math.abs(old.height - height) < 0.1 ? old : { width, height }); });
    observer.observe(scroll.current!); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { cancelDrag(); }, [cellSize, board.cols, board.rows]);
  function target(x: number, y: number) { return document.elementsFromPoint(x, y).map(el => el.closest<HTMLElement>('[data-cell]')).find(Boolean)?.dataset.cell ?? null; }
  function start(e: PointerEvent<HTMLButtonElement>, c?: Character) {
    if (!c || e.button !== 0 || !e.isPrimary || camera.blocksPointer()) return;
    drag.current = { id: c.id, pointer: e.pointerId, owner: e.currentTarget, startX: e.clientX, startY: e.clientY, originX: c.x!, originY: c.y!, active: false };
    suppressClick.current = false; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function update(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d || d.pointer !== e.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 7) return;
    d.active = true; e.preventDefault();
    const area = scroll.current!, rect = area.getBoundingClientRect();
    if (e.clientX < rect.left + 35) area.scrollLeft -= 16; else if (e.clientX > rect.right - 35) area.scrollLeft += 16;
    if (e.clientY < rect.top + 35) area.scrollTop -= 16; else if (e.clientY > rect.bottom - 35) area.scrollTop += 16;
    setGhost({ id: d.id, x: e.clientX, y: e.clientY, target: target(e.clientX, e.clientY) });
  }
  function finish(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d || d.pointer !== e.pointerId) return;
    drag.current = null; setGhost(null);
    if (d.active) {
      suppressClick.current = true;
      const at = target(e.clientX, e.clientY), current = board.characters.find(c => c.id === d.id);
      if (!current || current.x !== d.originX || current.y !== d.originY) notify('Позиция изменилась во время переноса. Попробуйте ещё раз.');
      else if (at) { const [x, y] = at.split('-').map(Number); move(d.id, x, y); }
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const ghostCharacter = board.characters.find(c => c.id === ghost?.id);
  return <><div className="arena-toolbar"><div className="arena-meta"><Grid2X2 size={16}/><strong>{board.cols} × {board.rows}</strong><span>Клетка 2 м</span></div><div className="zoom-controls"><button className="icon-button" aria-label="Уменьшить клетки" disabled={zoom <= 10} onClick={() => camera.step(1 / 1.25)}><Minus size={16}/></button><button className="zoom-fit" aria-label="Показать всё поле" title="Вписать всё поле · Ctrl+0" onClick={camera.reset}>{Math.round(zoom)}%</button><button className="icon-button" aria-label="Увеличить клетки" disabled={zoom >= 800} onClick={() => camera.step(1.25)}><Plus size={16}/></button></div></div><div className="arena-scroll" ref={scroll} tabIndex={-1} role="region" aria-label="Область карты"><div className="board-grid" ref={grid} data-cell-size={cellSize} data-zoom={zoom} style={{ ...pieceStyle(cellSize), '--axis-font': `${Math.min(10, cellSize * 0.3)}px`, gridTemplateColumns: `${axis}px repeat(${board.cols}, ${cellSize}px)`, gridTemplateRows: `${axis}px repeat(${board.rows}, ${cellSize}px)` } as CSSProperties}><span className="grid-corner"/>{Array.from({ length: board.cols }, (_, x) => <span className="col-label" key={`c${x}`}>{columnName(x)}</span>)}{Array.from({ length: board.rows }, (_, y) => <div className="grid-row" key={y}><span className="row-label">{y + 1}</span>{Array.from({ length: board.cols }, (_, x) => {
    const c = board.characters.find(c => c.x === x && c.y === y), cell = `${x}-${y}`;
    return <button key={x} data-cell={cell} tabIndex={Math.min(focus.x, board.cols - 1) === x && Math.min(focus.y, board.rows - 1) === y ? 0 : -1} aria-label={`${columnName(x)}${y + 1}${c ? `, ${c.name}` : ', свободно'}`} className={`cell ${(x + y) % 2 ? 'alternating' : ''} ${moving ? 'move-mode' : ''} ${c ? 'occupied' : ''} ${c?.id === selected ? 'selected-cell' : ''} ${ghost?.id === c?.id ? 'drag-source' : ''} ${ghost?.target === cell ? 'drop-target' : ''}`} onPointerDown={e => start(e, c)} onPointerMove={update} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setGhost(null); }} onLostPointerCapture={() => { drag.current = null; setGhost(null); }} onClick={e => { if (e.detail && suppressClick.current) { suppressClick.current = false; return; } chooseCell(x, y); setFocus({ x, y }); }} onContextMenu={e => { if (c) e.preventDefault(); }} onKeyDown={e => {
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]; if (!dir) return;
      e.preventDefault(); const nx = Math.max(0, Math.min(board.cols - 1, x + dir[0])), ny = Math.max(0, Math.min(board.rows - 1, y + dir[1])); setFocus({ x: nx, y: ny }); scroll.current?.querySelector<HTMLButtonElement>(`[data-cell="${nx}-${ny}"]`)?.focus();
    }}>{c && <Piece c={c}/>}</button>;
  })}</div>)}</div></div>{ghost && ghostCharacter && <div className="drag-ghost" aria-hidden="true" style={{ ...pieceStyle(Math.max(32, cellSize)), left: ghost.x, top: ghost.y, width: Math.max(32, cellSize), height: Math.max(32, cellSize) }}><Piece c={ghostCharacter}/></div>}</>;
}
