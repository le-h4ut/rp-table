export const MAX_VALUE = 1_000_000_000_000;
export type Character = { id: string; type: 'character'; folderId: string | null; name: string; hp: number; maxHp: number; oh: number; maxOh: number; x: number | null; y: number | null };
export type Folder = { id: string; name: string; parentId: string | null };
export type Board = { title: string; cols: number; rows: number; characters: Character[]; folders: Folder[] };
export type RecordData = { schemaVersion: 1; revision: number; lastMutationId: string; board: Board };
export const emptyBoard = (): Board => ({ title: 'Моё поле боя', cols: 10, rows: 10, characters: [], folders: [] });
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
export function validateBoard(value: unknown): Board {
  const b = structuredClone(value) as Board;
  if (!b || typeof b !== 'object' || typeof b.title !== 'string' || !b.title.trim() || b.title.length > 80 || !integer(b.cols, 1, 50) || !integer(b.rows, 1, 50) || !Array.isArray(b.characters) || b.characters.length > 200) throw new Error('Не удалось прочитать поле. Исходное сохранение не изменено.');
  const ids = new Set<string>(), cells = new Set<string>();
  // Upgrade v0 saves without changing the source draft.
  b.folders ??= [];
  if (!Array.isArray(b.folders) || b.folders.length > 200) throw new Error('Слишком много папок или повреждено дерево.');
  const folders = new Map<string, Folder>();
  for (const f of b.folders) {
    if (!f || typeof f.id !== 'string' || !f.id || f.id.length > 100 || folders.has(f.id) || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 80 || (f.parentId !== null && typeof f.parentId !== 'string')) throw new Error('Некорректная папка.');
    folders.set(f.id, f);
  }
  for (const f of b.folders) {
    const seen = new Set([f.id]); let parent = f.parentId;
    while (parent !== null) { if (!folders.has(parent) || seen.has(parent) || seen.size >= 16) throw new Error('Папки не могут содержать сами себя. Максимальная глубина — 16.'); seen.add(parent); parent = folders.get(parent)!.parentId; }
  }
  for (const c of b.characters) {
    if (!c || typeof c !== 'object') throw new Error('В сохранении некорректная карточка.');
    c.type ??= 'character'; c.folderId ??= null;
    if (c.type !== 'character' || (c.folderId !== null && !folders.has(c.folderId))) throw new Error('Неизвестный тип карточки или папка.');
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 100 || ids.has(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80 || !integer(c.maxHp, 1, MAX_VALUE) || !integer(c.hp, 0, c.maxHp) || !integer(c.maxOh, 0, MAX_VALUE) || !integer(c.oh, 0, Math.floor(c.maxOh * 1.5))) throw new Error('В сохранении некорректная карточка. Исходные данные не изменены.');
    ids.add(c.id);
    if (c.x === null && c.y === null) continue;
    if (!integer(c.x, 0, b.cols - 1) || !integer(c.y, 0, b.rows - 1) || cells.has(`${c.x},${c.y}`)) throw new Error('В сохранении некорректная позиция персонажа.');
    cells.add(`${c.x},${c.y}`);
  }
  return structuredClone(b);
}
export function validateRecord(v: unknown): RecordData {
  const d = v as RecordData;
  if (!d || d.schemaVersion !== 1 || !integer(d.revision, 1, Number.MAX_SAFE_INTEGER) || typeof d.lastMutationId !== 'string') throw new Error('Формат облачного сохранения не поддерживается. Оно не перезаписано.');
  return { schemaVersion: 1, revision: d.revision, lastMutationId: d.lastMutationId, board: validateBoard(d.board) };
}
export function moveCharacter(b: Board, id: string, x: number, y: number): Board {
  if (!b.characters.some(c => c.id === id)) throw new Error('Персонаж не найден.');
  if (!integer(x, 0, b.cols - 1) || !integer(y, 0, b.rows - 1)) throw new Error('Клетка за границей поля.');
  if (b.characters.some(c => c.id !== id && c.x === x && c.y === y)) throw new Error('Эта клетка уже занята.');
  return validateBoard({ ...b, characters: b.characters.map(c => c.id === id ? { ...c, x, y } : c) });
}
export function resizeBoard(b: Board, title: string, cols: number, rows: number): Board {
  if (b.characters.some(c => c.x !== null && c.y !== null && (c.x >= cols || c.y >= rows))) throw new Error('Сначала переместите персонажей, которые окажутся за границей нового поля.');
  return validateBoard({ ...b, title: title.trim(), cols, rows });
}
export function columnName(x: number): string { let s = ''; for (let n = x + 1; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
export function numberInput(v: string, label: string): number {
  const clean = v.replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d+$/.test(clean) || !Number.isSafeInteger(Number(clean))) throw new Error(`${label}: введите целое неотрицательное число.`);
  return Number(clean);
}
export function currentInput(v: string, current: number, max: number, label: string): number {
  const clean = v.replace(/[\s\u00a0\u202f]/g, '');
  const relative = /^[+-]/.test(clean);
  const amount = numberInput(relative ? clean.slice(1) : clean, label);
  const value = relative ? current + (clean[0] === '-' ? -amount : amount) : amount;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}: итог должен быть целым неотрицательным числом.`);
  return Math.min(value, max);
}
export function folderPath(b: Board, id: string | null): string {
  if (id === null) return 'Корень';
  const names: string[] = []; let at = b.folders.find(f => f.id === id);
  while (at) { names.unshift(at.name); at = b.folders.find(f => f.id === at!.parentId); }
  return names.join(' / ');
}
export function saveFolder(b: Board, folder: Folder): Board {
  return validateBoard({ ...b, folders: b.folders.some(f => f.id === folder.id) ? b.folders.map(f => f.id === folder.id ? folder : f) : [...b.folders, folder] });
}
export function removeFolder(b: Board, id: string): Board {
  const f = b.folders.find(f => f.id === id); if (!f) throw new Error('Папка не найдена.');
  return validateBoard({ ...b, folders: b.folders.filter(f => f.id !== id).map(c => c.parentId === id ? { ...c, parentId: f.parentId } : c), characters: b.characters.map(c => c.folderId === id ? { ...c, folderId: f.parentId } : c) });
}
export function characterInitials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(s => [...s][0]).join('').toUpperCase(); }
