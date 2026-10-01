// Cache persistente (IndexedDB) das tabelas grandes por tenant, usado pela carga
// incremental do DataContext: no login só buscamos o que mudou desde a última visita
// (updated_at > marca) em vez de baixar a tabela inteira de novo. Tudo é opcional — qualquer
// falha (modo privado, quota, navegador sem IndexedDB) devolve null e o chamador faz a carga completa.

const DB_NAME = 'spy_table_cache';
const STORE = 'tables';
const VERSION = 1;

export interface TableSnapshot {
  rows: any[];
  /** maior updated_at já visto (ISO) — ponto de partida do próximo delta */
  since: string;
  ts: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

const keyOf = (tenantId: string, table: string) => `${tenantId}:${table}`;

export async function snapshotGet(tenantId: string, table: string): Promise<TableSnapshot | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyOf(tenantId, table));
      req.onsuccess = () => resolve((req.result as TableSnapshot) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function snapshotSet(tenantId: string, table: string, snap: TableSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snap, keyOf(tenantId, table));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}

export async function snapshotDelete(tenantId: string, table: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(keyOf(tenantId, table));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

/** Apaga tudo (logout): dado de tenant não pode ficar no navegador depois que a sessão acaba. */
export async function snapshotClearAll(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}
