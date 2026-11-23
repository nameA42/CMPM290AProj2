// Tiny IndexedDB key/value store for dataset contents (CSV rows can exceed localStorage limits).
const DB = 'research-dashboard';
const STORE = 'datasets';
let dbPromise;

function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

const cache = new Map();

export async function getData(id) {
  if (cache.has(id)) return cache.get(id);
  const v = await tx('readonly', (s) => s.get(id));
  if (v) cache.set(id, v);
  return v;
}
export async function putData(id, value) {
  cache.set(id, value);
  await tx('readwrite', (s) => s.put(value, id));
}
export async function deleteData(id) {
  cache.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}
export async function allData() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = {};
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out[c.key] = c.value; c.continue(); }
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}
export async function clearData() {
  cache.clear();
  await tx('readwrite', (s) => s.clear());
}
