import { emptyBoard, validateBoard, type Board, type RecordData } from './domain';

export type Draft = { board: Board; baseRevision: number; dirty: boolean };
export type DraftStore = { read(): Draft | null; write(d: Draft): void };
export type Transport = { watch(next: (record: RecordData | null) => void, error: (error: unknown) => void): () => void; save(board: Board, base: number, mutation: string): Promise<RecordData> };
export type Status = 'loading' | 'local' | 'dirty' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';
export type SessionView = { board: Board; status: Status; message: string; ready: boolean; dirty: boolean; localFailure: boolean };
export class Conflict extends Error {}
export class BoardSession {
  view: SessionView;
  private listeners = new Set<() => void>();
  private revision = 0;
  private seq = 0;
  private inFlight: { id: string; seq: number; base: number } | null = null;
  private ownMutations = new Set<string>();
  private remote: RecordData | null = null;
  private received = false;
  private stopped = false;
  private readFailure = false;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  constructor(private store: DraftStore, private transport?: Transport) {
    this.view = { board: emptyBoard(), status: transport ? 'loading' : 'local', ready: !transport, dirty: false, message: '', localFailure: false };
    try { const d = store.read(); if (d) { this.view.board = validateBoard(d.board); this.view.dirty = d.dirty; this.revision = d.baseRevision; } }
    catch { this.readFailure = true; this.view.status = 'error'; this.view.message = 'Не удалось прочитать локальное сохранение. Данные не перезаписаны.'; this.view.localFailure = true; }
    if (transport && !this.view.localFailure) { this.connectionTimer = setTimeout(() => { if (!this.received) this.fail({ code: 'unavailable' }); }, 8000); this.unsubscribe = transport.watch(r => this.receive(r), e => this.fail(e)); }
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.view;
  private emit(patch: Partial<SessionView> = {}) { if (this.stopped) return; this.view = { ...this.view, ...patch }; this.listeners.forEach(fn => fn()); }
  private persist() {
    try { this.store.write({ board: this.view.board, baseRevision: this.revision, dirty: this.view.dirty }); }
    catch { this.emit({ localFailure: true, message: 'Не удалось сохранить на устройстве. Не закрывайте страницу до сохранения в облако.', status: 'error' }); }
  }
  private receive(r: RecordData | null) {
    if (this.stopped) return;
    clearTimeout(this.connectionTimer);
    this.remote = r;
    const rev = r?.revision ?? 0;
    if (r && this.ownMutations.has(r.lastMutationId)) return;
    this.received = true;
    if (this.view.dirty) {
      if (rev !== this.revision) { this.emit({ ready: true, status: 'conflict', message: 'На другом устройстве поле изменилось. Ваша версия сохранена здесь; выберите, какую продолжить.' }); return; }
      this.emit({ ready: true, status: 'dirty', message: '' }); this.schedule(); return;
    }
    this.revision = rev;
    this.emit({ board: r?.board ?? emptyBoard(), ready: true, status: r ? 'saved' : 'local', message: '' });
    this.persist();
  }
  edit(board: Board) {
    if (this.view.status === 'conflict' || this.view.localFailure) throw new Error(this.view.localFailure ? 'Сначала восстановите возможность сохранения.' : 'Сначала выберите версию поля.');
    const next = validateBoard(board);
    this.seq++;
    this.emit({ board: next, dirty: true, status: this.transport ? (this.inFlight ? 'saving' : 'dirty') : 'local', message: '' });
    this.persist(); this.schedule();
  }
  private schedule() { clearTimeout(this.timer); if (this.transport && this.received && this.view.status !== 'conflict') this.timer = setTimeout(() => { void this.save(); }, 700); }
  async save() {
    clearTimeout(this.timer);
    if (this.stopped || !this.transport || !this.received || this.inFlight || !this.view.dirty || this.view.status === 'conflict') return;
    const pending = { id: crypto.randomUUID(), seq: this.seq, base: this.revision };
    const board = structuredClone(this.view.board);
    this.inFlight = pending; this.ownMutations.add(pending.id);
    this.emit({ status: 'saving', message: '' });
    try {
      const result = await this.transport.save(board, pending.base, pending.id);
      if (this.stopped) return;
      this.revision = result.revision;
      const dirty = this.seq !== pending.seq;
      const other = this.remote && this.remote.revision > result.revision && !this.ownMutations.has(this.remote.lastMutationId);
      if (other && dirty) this.emit({ status: 'conflict', dirty, message: 'На другом устройстве поле изменилось. Ваша версия сохранена здесь.' });
      else if (other) { this.revision = this.remote!.revision; this.emit({ board: this.remote!.board, dirty: false, status: 'saved', message: '' }); }
      else this.emit({ dirty, status: dirty ? 'dirty' : 'saved', message: '', localFailure: false });
      this.persist();
    } catch (e) { if (!this.stopped) this.fail(e); }
    finally { this.inFlight = null; if (!this.stopped && this.view.dirty && this.view.status === 'dirty') this.schedule(); }
  }
  private fail(e: unknown) {
    const code = (e as { code?: string })?.code;
    const offline = code === 'unavailable' || code === 'deadline-exceeded' || (typeof navigator !== 'undefined' && !navigator.onLine);
    this.emit({ status: e instanceof Conflict ? 'conflict' : offline ? 'offline' : 'error', message: e instanceof Conflict ? 'Другая вкладка уже сохранила изменения. Ваша версия осталась на устройстве.' : offline ? 'Нет связи с облаком. Изменения остаются на этом устройстве.' : e instanceof Error ? e.message : 'Не удалось подключиться к сохранению.' });
  }
  loadCloud() {
    if (!this.received || this.inFlight) return;
    this.revision = this.remote?.revision ?? 0;
    this.emit({ board: this.remote?.board ?? emptyBoard(), dirty: false, status: this.remote ? 'saved' : 'local', message: '' });
    this.persist();
  }
  retry() {
    if (this.readFailure) {
      try {
        const d = this.store.read();
        this.revision = d?.baseRevision ?? 0;
        this.emit({ board: d ? validateBoard(d.board) : emptyBoard(), dirty: d?.dirty ?? false, localFailure: false, status: this.transport ? 'loading' : 'local', message: '' });
        this.readFailure = false;
      } catch { return; }
    }
    if (this.view.localFailure) { this.view = { ...this.view, localFailure: false }; this.persist(); if (this.view.localFailure) return; }
    if (this.view.status === 'conflict') return;
    if (this.transport) {
      this.unsubscribe?.();
      this.emit({ status: 'loading', message: '' });
      clearTimeout(this.connectionTimer);
      this.connectionTimer = setTimeout(() => this.fail({ code: 'unavailable' }), 8000);
      this.unsubscribe = this.transport.watch(r => this.receive(r), e => this.fail(e));
    } else this.emit({ status: 'local', message: '' });
  }
  dispose() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.connectionTimer); this.unsubscribe?.(); this.listeners.clear(); }
}

export function localStore(key: string): DraftStore {
  return {
    read() { const s = localStorage.getItem(key); if (!s) return null; const d = JSON.parse(s); if (!Number.isSafeInteger(d.baseRevision) || d.baseRevision < 0 || typeof d.dirty !== 'boolean') throw new Error('Bad draft'); return { ...d, board: validateBoard(d.board) }; },
    write(d) { localStorage.setItem(key, JSON.stringify(d)); },
  };
}
