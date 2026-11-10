import { useRef, useState, type PointerEvent } from 'react';
import { characterInitials, columnName, type Board, type Character } from './domain';

function Piece({ c }: { c: Character }) {
  return <span className="token-piece" data-token={c.id}><span className={`token ${c.hp === 0 ? 'fallen' : ''}`}><span>{characterInitials(c.name)}</span></span><span className="token-stat hp" role="progressbar" aria-label={`${c.name} HP`} aria-valuemin={0} aria-valuemax={c.maxHp} aria-valuenow={c.hp}><i style={{ width: `${c.hp / c.maxHp * 100}%` }}/></span><span className={`token-stat oh ${c.oh > c.maxOh ? 'overheat' : ''}`} role="progressbar" aria-label={`${c.name} OH`} aria-valuemin={0} aria-valuemax={Math.max(c.maxOh, c.oh, 1)} aria-valuenow={c.oh}><i style={{ width: `${c.maxOh ? Math.min(100, c.oh / c.maxOh * 100) : 0}%` }}/></span></span>;
}
type Drag = { id: string; pointer: number; startX: number; startY: number; originX: number; originY: number; active: boolean };
export function BattleGrid({ board, zoom, selected, moving, chooseCell, move, notify }: {
  board: Board; zoom: number; selected: string | null; moving: string | null;
  chooseCell(x: number, y: number): void; move(id: string, x: number, y: number): void; notify(message: string): void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null), suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const [focus, setFocus] = useState({ x: 0, y: 0 });
  function target(x: number, y: number) { return document.elementsFromPoint(x, y).map(el => el.closest<HTMLElement>('[data-cell]')).find(Boolean)?.dataset.cell ?? null; }
  function start(e: PointerEvent<HTMLButtonElement>, c?: Character) {
    if (!c || e.button !== 0 || !e.isPrimary) return;
    drag.current = { id: c.id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, originX: c.x!, originY: c.y!, active: false };
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
  return <><div className="arena-scroll" ref={scroll} tabIndex={-1}><div className="board-grid" style={{ gridTemplateColumns: `28px repeat(${board.cols}, ${zoom}px)`, gridTemplateRows: `28px repeat(${board.rows}, ${zoom}px)` }}><span className="grid-corner"/>{Array.from({ length: board.cols }, (_, x) => <span className="col-label" key={`c${x}`}>{columnName(x)}</span>)}{Array.from({ length: board.rows }, (_, y) => <div className="grid-row" key={y}><span className="row-label">{y + 1}</span>{Array.from({ length: board.cols }, (_, x) => {
    const c = board.characters.find(c => c.x === x && c.y === y), cell = `${x}-${y}`;
    return <button key={x} data-cell={cell} tabIndex={Math.min(focus.x, board.cols - 1) === x && Math.min(focus.y, board.rows - 1) === y ? 0 : -1} aria-label={`${columnName(x)}${y + 1}${c ? `, ${c.name}` : ', свободно'}`} className={`cell ${(x + y) % 2 ? 'alternating' : ''} ${moving ? 'move-mode' : ''} ${c ? 'occupied' : ''} ${c?.id === selected ? 'selected-cell' : ''} ${ghost?.id === c?.id ? 'drag-source' : ''} ${ghost?.target === cell ? 'drop-target' : ''}`} onPointerDown={e => start(e, c)} onPointerMove={update} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setGhost(null); }} onLostPointerCapture={() => { drag.current = null; setGhost(null); }} onClick={e => { if (e.detail && suppressClick.current) { suppressClick.current = false; return; } chooseCell(x, y); setFocus({ x, y }); }} onContextMenu={e => { if (c) e.preventDefault(); }} onKeyDown={e => {
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]; if (!dir) return;
      e.preventDefault(); const nx = Math.max(0, Math.min(board.cols - 1, x + dir[0])), ny = Math.max(0, Math.min(board.rows - 1, y + dir[1])); setFocus({ x: nx, y: ny }); scroll.current?.querySelector<HTMLButtonElement>(`[data-cell="${nx}-${ny}"]`)?.focus();
    }}>{c && <Piece c={c}/>}</button>;
  })}</div>)}</div></div>{ghost && ghostCharacter && <div className="drag-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y, width: zoom - 12, height: zoom - 12 }}><Piece c={ghostCharacter}/></div>}</>;
}
