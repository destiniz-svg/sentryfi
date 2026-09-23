/**
 * Receipts kept on the phone until they are sent as a claim (the companion
 * app, pages/Go.jsx). IndexedDB, because a receipt is a photograph: the Blob is
 * kept as it is, and survives a closed tab and a day with no signal. Kept per
 * person and company, so a shared phone never sends one person's receipts as
 * another's. Sending removes them; nothing else does, except the person.
 */
const DB = "sentryfi-expenses";
const STORE = "kept";

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.objectStoreNames.contains(STORE) || r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function kept({ companyId, userId }) {
  try {
    const all = (await run("readonly", (s) => s.getAll())) || [];
    return all.filter((e) => e.companyId === companyId && e.userId === userId).sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export const keep = (expense) => run("readwrite", (s) => s.put({ ...expense, at: expense.at || Date.now() }));
export const forget = (id) => run("readwrite", (s) => s.delete(id));
