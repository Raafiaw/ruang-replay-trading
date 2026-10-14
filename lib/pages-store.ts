import type { Dataset } from './engine';
export type SessionRef = { id: string; datasetId: string };
export type SavedLocal<T extends SessionRef = SessionRef> = { id: string; payload: T; updatedAt: number };
let connection: Promise<IDBDatabase> | undefined;
let lastDataset: Dataset | undefined;

function openStore() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Penyimpanan browser tidak tersedia.')); return; }
    const request = indexedDB.open('ruang-replay-pages', 1);
    request.onupgradeneeded = () => {
      for (const name of ['state', 'datasets', 'sessions']) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Penyimpanan browser tidak dapat dibuka.'));
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}

async function read<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function persistActive<T extends SessionRef>(session: T, data: Dataset) {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['state', 'datasets'], 'readwrite');
    tx.objectStore('state').put({ session, datasetId: data.id }, 'active');
    if (lastDataset !== data) tx.objectStore('datasets').put(data, data.id);
    tx.oncomplete = () => { lastDataset = data; resolve(); };
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Penyimpanan browser penuh atau tidak tersedia.'));
  });
}

export async function restoreActive<T extends SessionRef>() {
  const active = await read<{ session: T; datasetId: string }>('state', 'active');
  if (!active) return null;
  const data = await read<Dataset>('datasets', active.datasetId);
  return data?.candles?.length && active.session.datasetId === data.id ? { session: active.session, data } : null;
}

export const localDataset = (id: string) => read<Dataset>('datasets', id);

export async function listLocalSessions<T extends SessionRef>(): Promise<SavedLocal<T>[]> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
    request.onsuccess = () => resolve((request.result as SavedLocal<T>[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalSession<T extends SessionRef>(row: SavedLocal<T>) {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    const request = store.getAllKeys();
    let failure: Error | null = null;
    request.onsuccess = () => {
      if (request.result.length >= 20 && !request.result.includes(row.id)) {
        failure = new Error('Maksimal 20 sesi. Hapus satu sesi sebelum menyimpan sesi baru.');
        tx.abort();
      } else store.put(row, row.id);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('Sesi tidak dapat disimpan.'));
  });
}

export async function deleteLocalSession(id: string) {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Sesi tidak dapat dihapus.'));
  });
}
