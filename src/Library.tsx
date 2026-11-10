import { useState, type FormEvent } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, FolderPlus, Plus, Pencil, UserRound, Grid2X2, Copy, Trash2, MapPin } from 'lucide-react';
import { folderPath, saveFolder, type Board, type Character, type Folder } from './domain';

export function Library({ board, activeFolder, selectFolder, openCard, newCard, editFolder, clone, remove, place }: {
  board: Board; activeFolder: string | null; selectFolder(id: string | null): void;
  openCard(c: Character): void; newCard(): void; editFolder(f?: Folder): void;
  clone(id: string): void; remove(id: string): void; place(id: string): void;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  function branch(parentId: string | null, depth: number): React.ReactNode {
    return <>{board.folders.filter(f => f.parentId === parentId).map(f => <div key={f.id} className="tree-branch">
      <div className={`tree-row ${activeFolder === f.id ? 'active' : ''}`} style={{ paddingLeft: Math.min(depth, 5) * 12 }}>
        <button className="icon-button tree-toggle" aria-label={`${closed.has(f.id) ? 'Развернуть' : 'Свернуть'} ${f.name}`} aria-expanded={!closed.has(f.id)} onClick={() => setClosed(prev => { const s = new Set(prev); s.has(f.id) ? s.delete(f.id) : s.add(f.id); return s; })}>{closed.has(f.id) ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}</button>
        <button className="tree-name" title={folderPath(board, f.id)} onClick={() => selectFolder(f.id)}><FolderIcon size={17}/><span>{depth > 5 && <small className="tree-depth">Уровень {depth + 1} · </small>}{f.name}</span></button>
        <button className="icon-button" aria-label={`Настроить папку ${f.name}`} onClick={() => editFolder(f)}><Pencil size={14}/></button>
      </div>{!closed.has(f.id) && branch(f.id, depth + 1)}</div>)}
      {board.characters.filter(c => c.folderId === parentId).map(c => <div className="tree-unit" key={c.id} data-card-id={c.id} style={{ marginLeft: Math.min(depth, 5) * 12 }}><button className="tree-card" onClick={() => openCard(c)}><UserRound size={17}/><span>{c.name}<small>Персонаж · {c.x === null ? 'в резерве' : 'на поле'}</small></span></button><div className="tree-unit-actions"><button className="text-button" aria-label={`На поле: ${c.name}`} title={c.x === null ? 'Выбрать клетку' : 'Создать клона и выбрать клетку'} onClick={() => place(c.id)}><MapPin size={15}/><span>На поле</span></button><button className="icon-button" aria-label={`Клонировать: ${c.name}`} title="Клонировать" onClick={() => clone(c.id)}><Copy size={16}/></button><button className="icon-button danger" aria-label={`Удалить: ${c.name}`} title="Удалить" onClick={() => remove(c.id)}><Trash2 size={16}/></button></div></div>)}</>;
  }
  return <div className="library-content"><div className="library-actions"><button className="primary" onClick={newCard}><Plus size={17}/>Карточка</button><button className="secondary" onClick={() => editFolder()}><FolderPlus size={17}/>Папка</button></div><p className="form-note library-help">Выберите папку — новые карточки и папки появятся внутри неё. Вложенность и названия задаёте вы.</p><div className="library-tree" aria-label="Дерево карточек"><button className={`tree-root ${activeFolder === null ? 'active' : ''}`} onClick={() => selectFolder(null)}><Grid2X2 size={17}/>Все карточки <small>{board.characters.length}</small></button>{branch(null, 0)}{!board.folders.length && !board.characters.length && <p className="empty-tree">Начните с папки или карточки.<br/>Например: Персонажи → Игровые → Теодор.</p>}</div><div className="library-location">Добавлять в: <strong>{folderPath(board, activeFolder)}</strong></div></div>;
}

export function FolderForm({ board, folder, parentId, submit, remove, close }: {
  board: Board; folder?: Folder; parentId: string | null; submit(f: Folder): void; remove(id: string): void; close(): void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [parent, setParent] = useState(folder ? folder.parentId ?? '' : parentId ?? '');
  const [error, setError] = useState('');
  // Exclude self and descendants from the destination selector.
  const destinations = board.folders.filter(f => { let at: Folder | undefined = f; while (at) { if (at.id === folder?.id) return false; at = board.folders.find(p => p.id === at!.parentId); } return true; });
  function save(e: FormEvent) { e.preventDefault(); try { const f = { id: folder?.id ?? crypto.randomUUID(), name: name.trim(), parentId: parent || null }; saveFolder(board, f); submit(f); } catch (e) { setError((e as Error).message); } }
  return <form className="form" onSubmit={save}><label>Название папки<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><label>Внутри папки<select value={parent} onChange={e => setParent(e.target.value)}><option value="">Корень</option>{destinations.map(f => <option key={f.id} value={f.id}>{folderPath(board, f.id)}</option>)}</select></label>{error && <p role="alert" className="error-text">{error}</p>}<footer className="form-footer"><button type="button" className="secondary" onClick={close}>Отмена</button><button className="primary" type="submit">Сохранить папку</button></footer>{folder && <button type="button" className="text-button danger" onClick={() => { try { remove(folder.id); } catch (e) { setError((e as Error).message); } }}>Удалить папку, сохранив содержимое</button>}</form>;
}
