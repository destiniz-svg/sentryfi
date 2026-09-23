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
// 2 added "sends": any other write made in the field (a cash spend, a count,
// cash received, a delivery), held the same way and sent with its own key.
const SENDS = "sends";
const VERSION = 2;

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "ref" });
      }
      if (!db.objectStoreNames.contains(SENDS)) {
        db.createObjectStore(SENDS, { keyPath: "ref" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, fn, name = STORE) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
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

export async function hold({ companyId, userId, payload, files }) {
  // If the capture screen already decided on a key — because it tried to send
  // and the reply never came — keep it. A new key here would make the retry a
  // second bill instead of the same one.
  const ref = payload?.clientRef || crypto.randomUUID();
  await run("readwrite", (store) =>
    request(
      store.put({
        ref,
        companyId,
        // Whose it is: on a shared site phone the next person to sign in must
        // not send the last one's bills as their own.
        userId,
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
/** Items taken by this person in this company. Ones from before items carried a person are anyone's. */
export const mine = (items, { companyId, userId }) =>
  items.filter((i) => i.companyId === companyId && (!i.userId || i.userId === userId));

export async function send({ companyId, userId, record, attach, put }) {
  if (!navigator.onLine) return { sent: 0, failed: 0, skipped: true };

  const items = mine(await waiting(), { companyId, userId });
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await record(item.payload);

      // The promise is a bill in the books once there is signal, not a bill
      // in a list waiting for somebody to finish the job later. That is how a
      // drawer of unposted bills happens, only invisible.
      //
      // Only when the server had not seen it before. If this is a retry of a
      // send whose reply was lost, the first attempt may already have posted
      // it, and posting again is not something to guess at — the bill is on
      // the board either way, and a person can finish it.
      if (put && !result.alreadyHad) {
        try {
          await put(result.bill.id);
        } catch {
          // Blocked on something a person has to decide — an unknown tax
          // treatment, most often. It stays a recorded bill and says so.
        }
      }

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

// ------------------------------------------------------------------ any other write

/**
 * A write made in the field with no signal: which company, whose, the request,
 * and a plain line saying what it was ("MVR 300.00 out of the tin: sand").
 * The ref is the request's Idempotency-Key, made before the first attempt, so
 * however many times it is sent the server does it once.
 */
export async function holdSend({ ref, companyId, userId, method, url, body, label }) {
  await run(
    "readwrite",
    (store) => request(store.put({ ref, companyId, userId, method, url, body, label, queuedAt: Date.now(), attempts: 0, lastError: null, refused: null })),
    SENDS
  );
  return ref;
}

export async function waitingSends() {
  try {
    const all = await run("readonly", (store) => request(store.getAll()), SENDS);
    return (all || []).sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  }
}

export async function dropSend(ref) {
  await run("readwrite", (store) => request(store.delete(ref)), SENDS);
}

async function markSend(ref, change) {
  await run(
    "readwrite",
    async (store) => {
      const item = await request(store.get(ref));
      if (item) await request(store.put({ ...item, ...change, attempts: (item.attempts || 0) + 1 }));
    },
    SENDS
  );
}

/**
 * Sends what is waiting, oldest first, each with its own key. The server has
 * it: dropped. No answer: kept, tried again later. Refused (the tin is closed,
 * a count needs a reason): kept and marked, because trying again will not
 * change the answer; a person reads why and decides.
 */
export async function sendAll({ companyId, userId, go }) {
  if (!navigator.onLine) return { sent: 0, skipped: true };
  let sent = 0;
  for (const item of mine(await waitingSends(), { companyId, userId })) {
    if (item.refused) continue;
    try {
      await go(item);
      await dropSend(item.ref);
      sent += 1;
    } catch (err) {
      if (!err?.status) await markSend(item.ref, { lastError: "No signal" });
      else if (err.status === 409) await markSend(item.ref, { lastError: err.message });
      else await markSend(item.ref, { refused: err.message || "Refused" });
    }
  }
  return { sent, skipped: false };
}
