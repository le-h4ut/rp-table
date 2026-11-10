import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard, moveCharacter, cloneCharacter, preparePlacement, fitCellSize, resizeBoard, validateBoard, numberInput, currentInput, saveFolder, removeFolder, MAX_VALUE, type Board, type RecordData } from '../src/domain';
import { BoardSession, Conflict, type Draft, type Transport } from '../src/session';
const hero = { id: 'hero', type: 'character' as const, folderId: null, name: 'Теодор', hp: 2000, maxHp: 2000, oh: 0, maxOh: 40, x: null, y: null };
const board = (): Board => ({ ...emptyBoard(), characters: [{ ...hero }] });
const record = (revision: number, b = board(), id = 'remote'): RecordData => ({ schemaVersion: 1, revision, board: b, lastMutationId: id });
function setup(draft: Draft | null = null) {
  let stored = draft;
  let next!: (r: RecordData | null) => void;
  const save = vi.fn<Transport['save']>();
  const transport: Transport = { watch(n) { next = n; return vi.fn(); }, save };
  const session = new BoardSession({ read: () => stored, write: d => { stored = structuredClone(d); } }, transport);
  return { session, save, receive: (r: RecordData | null) => next(r), stored: () => stored };
}
afterEach(() => vi.useRealTimers());
describe('поле и характеристики', () => {
  it('копирует актуальные параметры независимо, сохраняя папку и сбрасывая позицию', () => {
    const b = moveCharacter(board(), 'hero', 1, 2); b.characters[0].hp = 1200; b.characters[0].oh = 20;
    const result = cloneCharacter(b, 'hero', 'copy');
    result.board.characters[1].hp = 100;
    expect(result.board.characters[0].hp).toBe(1200); expect(b.characters).toHaveLength(1);
    expect(result.character).toMatchObject({ id: 'copy', x: null, y: null, oh: 20, maxOh: 40, folderId: null });
    const placed = preparePlacement(b, 'hero', 'placed-copy'); expect(placed.character.id).toBe('placed-copy');
    const reserve = preparePlacement(board(), 'hero', 'unused'); expect(reserve.character.id).toBe('hero'); expect(reserve.board.characters).toHaveLength(1);
  });
  it('не теряет уникальность длинных имён копий и проверяет предел карточек', () => {
    let b = board(); b.characters[0].name = 'Я'.repeat(80);
    b = cloneCharacter(b, 'hero', 'one').board; b = cloneCharacter(b, 'one', 'two').board;
    expect(new Set(b.characters.map(c => c.name)).size).toBe(3); expect(b.characters.every(c => c.name.length <= 80)).toBe(true);
    expect(() => cloneCharacter(b, 'missing', 'bad')).toThrow(); expect(() => cloneCharacter(b, 'hero', 'hero')).toThrow();
    b.characters = Array.from({ length: 200 }, (_, i) => ({ ...hero, id: String(i) })); expect(() => cloneCharacter(b, '0', 'extra')).toThrow('200');
  });
  it('вписывает квадратные и вытянутые поля с координатами и рамкой', () => {
    for (const [width, height] of [[280, 180], [350, 400], [1200, 600]]) for (const [cols, rows] of [[10, 10], [50, 50], [1, 50], [50, 1]]) {
      const size = fitCellSize(width, height, cols, rows), axis = Math.min(24, size * .5);
      expect(size).toBeGreaterThan(0); expect(cols * size + axis + 1).toBeLessThanOrEqual(width); expect(rows * size + axis + 1).toBeLessThanOrEqual(height);
    }
  });
  it('абсолютное значение заменяет, знаковое прибавляет или вычитает', () => {
    expect(currentInput('1000', 2000, 5000, 'HP')).toBe(1000);
    expect(currentInput('+1000', 2000, 5000, 'HP')).toBe(3000);
    expect(currentInput('-1 000', 2000, 5000, 'HP')).toBe(1000);
    expect(currentInput('+10000', 2000, 5000, 'HP')).toBe(5000);
    expect(currentInput('10000', 2000, 5000, 'HP')).toBe(5000);
    for (const value of ['+', '--2', '+-2', '-3000']) expect(() => currentInput(value, 2000, 5000, 'HP')).toThrow();
  });
  it('мигрирует старое поле без папок и типа карточки без мутации исходника', () => {
    const old = { title: 'Старое', cols: 10, rows: 10, characters: [{ id: 'old', name: 'Герой', hp: 2, maxHp: 2, oh: 0, maxOh: 0, x: null, y: null }] };
    const result = validateBoard(old); expect(result.folders).toEqual([]); expect(result.characters[0].type).toBe('character'); expect(result.characters[0].folderId).toBe(null); expect('folders' in old).toBe(false);
  });
  it('не создаёт циклы папок и сохраняет содержимое при удалении родителя', () => {
    let b = saveFolder(board(), { id: 'a', name: 'Персонажи', parentId: null });
    b = saveFolder(b, { id: 'b', name: 'Игровые', parentId: 'a' });
    b.characters[0].folderId = 'a';
    expect(() => saveFolder(b, { id: 'a', name: 'Цикл', parentId: 'b' })).toThrow();
    const next = removeFolder(b, 'a'); expect(next.folders[0].parentId).toBe(null); expect(next.characters[0].folderId).toBe(null);
  });
  it('не пускает на занятую клетку и не обрезает персонажей', () => {
    const a = moveCharacter(board(), 'hero', 9, 9);
    expect(() => resizeBoard(a, 'Зал', 4, 5)).toThrow();
    a.characters.push({ ...hero, id: 'other' });
    expect(() => moveCharacter(a, 'other', 9, 9)).toThrow('занята');
    expect(board().characters[0].x).toBe(null);
  });
  it('принимает полтора максимума OH даже у больших чисел', () => {
    const b = board(); Object.assign(b.characters[0], { oh: MAX_VALUE * 1.5, maxOh: MAX_VALUE });
    expect(validateBoard(b).characters[0].oh).toBe(1.5e12);
    b.characters[0].oh++;
    expect(() => validateBoard(b)).toThrow();
  });
  it('не принимает пустые, дробные, отрицательные числа и NaN', () => {
    for (const value of ['', '-1', '1.2', 'NaN', '1e3']) expect(() => numberInput(value, 'HP')).toThrow();
    expect(numberInput('220 000', 'HP')).toBe(220000);
    expect(() => validateBoard({ ...board(), characters: [{ ...hero, maxOh: 0, oh: 1 }] })).toThrow();
  });
});
describe('облачная сессия', () => {
  it('повторяет подписку чистой сессии и возвращает подтверждённый статус', () => {
    const x = setup(); x.receive(record(1)); x.session.retry(); x.receive(record(1)); expect(x.session.view.status).toBe('saved'); expect(x.session.view.dirty).toBe(false); x.session.dispose();
  });
  it('повторное чтение повреждённого черновика не перезаписывает его пустым полем', () => {
    let broken = true;
    const write = vi.fn();
    const session = new BoardSession({ read() { if (broken) throw new Error('Corrupt'); return { board: board(), baseRevision: 3, dirty: true }; }, write });
    session.retry(); expect(write).not.toHaveBeenCalled(); expect(session.view.localFailure).toBe(true);
    broken = false; session.retry(); expect(session.view.board.characters).toHaveLength(1); expect(session.view.localFailure).toBe(false); session.dispose();
  });
  it('не отправляет пустое поле до получения сервера', async () => {
    vi.useFakeTimers(); const x = setup(); x.session.edit(board()); await vi.advanceTimersByTimeAsync(2000);
    expect(x.save).not.toHaveBeenCalled(); expect(x.stored()?.board.characters).toHaveLength(1); x.session.dispose();
  });
  it('показывает офлайн при отсутствии первого ответа, сохраняя локальные правки', async () => {
    vi.useFakeTimers(); const x = setup(); x.session.edit(board()); await vi.advanceTimersByTimeAsync(8100);
    expect(x.session.view.status).toBe('offline'); expect(x.stored()?.dirty).toBe(true); x.session.dispose();
  });
  it('сохраняет правку, сделанную во время отправки; собственный snapshot не конфликтует', async () => {
    vi.useFakeTimers(); const x = setup(); x.receive(null); x.session.edit(board());
    let resolve!: (r: RecordData) => void;
    x.save.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const first = x.session.save(); const [sent, base, mutation] = x.save.mock.calls[0];
    const changed = board(); changed.title = 'Поздняя правка'; x.session.edit(changed);
    x.receive(record(base + 1, sent, mutation)); resolve(record(base + 1, sent, mutation)); await first;
    expect(x.session.view.status).toBe('dirty'); expect(x.session.view.board.title).toBe('Поздняя правка');
    x.save.mockImplementationOnce(async (b, rev, id) => record(rev + 1, b, id));
    await x.session.save(); expect(x.save.mock.calls[1][1]).toBe(1); expect(x.stored()?.dirty).toBe(false); x.session.dispose();
  });
  it('не затирает чужую версию офлайн-черновиком после перезапуска', () => {
    const x = setup({ board: board(), baseRevision: 3, dirty: true }); x.receive(record(4));
    expect(x.session.view.status).toBe('conflict'); expect(x.stored()?.baseRevision).toBe(3);
    expect(() => x.session.edit(board())).toThrow(); x.session.loadCloud(); expect(x.stored()?.baseRevision).toBe(4); x.session.dispose();
  });
  it('не даёт старому аккаунту изменить состояние после выхода', async () => {
    const x = setup(); x.receive(null); x.session.edit(board()); let resolve!: (r: RecordData) => void;
    x.save.mockImplementationOnce(() => new Promise(r => { resolve = r; })); const promise = x.session.save();
    x.session.dispose(); const before = x.stored(); resolve(record(1)); await promise; x.receive(record(2));
    expect(x.stored()).toEqual(before);
  });
  it('сохраняет черновик при конфликте транзакции', async () => {
    const x = setup(); x.receive(null); x.session.edit(board()); x.save.mockRejectedValueOnce(new Conflict());
    await x.session.save(); expect(x.session.view.status).toBe('conflict'); expect(x.stored()?.dirty).toBe(true); x.session.dispose();
  });
});
