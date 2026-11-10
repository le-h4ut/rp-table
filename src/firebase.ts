import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { validateRecord, type Board, type RecordData } from './domain';
import { Conflict, type Transport } from './session';

export const app = initializeApp({
  apiKey: 'AIzaSyB-2kQmiTa6PWWypejBax0dIx_qltlD2ko',
  authDomain: 'rp-table-6644d.firebaseapp.com',
  projectId: 'rp-table-6644d',
  storageBucket: 'rp-table-6644d.firebasestorage.app',
  messagingSenderId: '401201481940',
  appId: '1:401201481940:web:fb7389f1cffc193992d341',
});
export const auth = getAuth(app);
auth.languageCode = 'ru';
export const authReady = setPersistence(auth, browserLocalPersistence);
// Bound to the account passed here; never consult a later auth.currentUser in callbacks.
export const db = getFirestore(app);
export const google = new GoogleAuthProvider();
// A bounded private snapshot, not a queryable collection of character documents.
function decode(data: Record<string, unknown>): RecordData {
  if (typeof data.boardJson !== 'string' || data.boardJson.length > 160000) throw new Error('Облачное поле имеет неподдерживаемый формат.');
  return validateRecord({ ...data, board: JSON.parse(data.boardJson) });
}
export function cloudBoard(uid: string): Transport {
  const ref = doc(db, 'users', uid, 'boards', 'main');
  return {
    watch(next, error) { return onSnapshot(ref, { includeMetadataChanges: true }, s => {
      if (s.metadata.fromCache || s.metadata.hasPendingWrites) return;
      try { next(s.exists() ? decode(s.data()) : null); } catch (e) { error(e); }
    }, error); },
    async save(board: Board, base: number, mutation: string) {
      return runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        const current = snap.exists() ? decode(snap.data()) : null;
        if ((current?.revision ?? 0) !== base) throw new Conflict();
        const record = { schemaVersion: 1 as const, revision: base + 1, lastMutationId: mutation, board };
        const boardJson = JSON.stringify(board);
        if (boardJson.length > 160000) throw new Error('Поле слишком большое для облачного сохранения.');
        tx.set(ref, { schemaVersion: 1, revision: record.revision, lastMutationId: mutation, boardJson, updatedAt: serverTimestamp() });
        return record;
      });
    },
  };
}
