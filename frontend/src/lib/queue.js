/**
 * Bills that are waiting for signal.
 *
 * The landing page says "No signal is fine: bills wait on the phone and go
 * when you are back." Until now that was untrue — with no signal the request
 * failed and the bill was gone. On a Maldivian site that is the difference
 * between the product working and not, because the moment a bill is in
 * somebody's hand is the only moment it reliably gets recorded.
 *
 * IndexedDB rather than localStorage, because localStorage holds strings and
 * a photograph is a Blob. The browser keeps the File itself, so nothing is
 * re-encoded and nothing is lost to a base64 round trip.
 *
 * Each entry carries a key generated here, before there is any signal. The
 * server treats that key as the identity of the bill, so a send retried after
 * a lost response produces one bill rather than two. That matters more than
 * it sounds: without it, a timeout on a bad connection silently doubles a cost.
 *
 * Honest limit, recorded in the product notes as well: iOS can evict a web
 * app's storage under pressure. This survives a day on site and a closed tab;
 * it is not a safe long-term store, and the answer to that is to send early
 * rather than to trust the queue.
 */

const DB = "sentryfi";
const STORE = "outbox";
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "ref" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    Promise.resolve(fn(store))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Everything waiting, oldest first — the order they were taken in. */
export async function waiting() {
  try {
    const all = await run("readonly", (store) => request(store.getAll()));
    return (all || []).sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    // A browser with storage blocked has no queue. Say so by being empty
    // rather than by throwing into a capture screen.
    return [];
  }
}

export async function hold({ companyId, payload, files }) {
  // If the capture screen already decided on a key — because it tried to send
  // and the reply never came — keep it. A new key here would make the retry a
  // second bill instead of the same one.
  const ref = payload?.clientRef || crypto.randomUUID();
  await run("readwrite", (store) =>
    request(
      store.put({
        ref,
        companyId,
        payload: { ...payload, clientRef: ref },
        files,
        queuedAt: Date.now(),
        attempts: 0,
        lastError: null,
      })
    )
  );
  return ref;
}

export async function drop(ref) {
  await run("readwrite", (store) => request(store.delete(ref)));
}

export async function noteAttempt(ref, error) {
  await run("readwrite", async (store) => {
    const item = await request(store.get(ref));
    if (!item) return;
    item.attempts = (item.attempts || 0) + 1;
    item.lastError = error ? String(error).slice(0, 200) : null;
    await request(store.put(item));
  });
}

/**
 * Sends everything that is waiting.
 *
 * Nothing is dropped until the server has confirmed it, and a failure leaves
 * the entry exactly where it was. The only thing that removes a bill from here
 * is the server saying it has it.
 */
export async function send({ companyId, record, attach }) {
  if (!navigator.onLine) return { sent: 0, failed: 0, skipped: true };

  const items = (await waiting()).filter((i) => i.companyId === companyId);
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await record(item.payload);
      for (const file of item.files || []) {
        // A photograph that will not attach must not hold the bill hostage —
        // the figures are already safe on the server at this point.
        try {
          await attach(result.bill.id, file);
        } catch {
          /* the bill is recorded; the paper can be added again */
        }
      }
      await drop(item.ref);
      sent += 1;
    } catch (err) {
      await noteAttempt(item.ref, err?.message);
      failed += 1;
    }
  }

  return { sent, failed, skipped: false };
}
