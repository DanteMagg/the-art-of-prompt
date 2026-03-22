const DB_NAME = "aop";
const DB_VERSION = 1;
const META_STORE = "meta";
const FRAMES_STORE = "frames";

const SESSION_KEY = "session";
const AUTOSAVE_KEY = "autosave";

interface FrameRecord {
  key: string; // "{scope}:{frameNumber}"
  html: string;
}

interface FrameMeta {
  number: number;
  promptText: string;
  acknowledgment: string;
  suggestions?: string[];
  createdAt: number;
}

interface SessionMeta {
  key: string; // "session" | "autosave"
  title: string;
  style: string;
  frames: FrameMeta[];
}

export interface Frame {
  number: number;
  promptText: string;
  html: string;
  acknowledgment: string;
  suggestions?: string[];
  createdAt: number;
}

export interface SessionData {
  title: string;
  frames: Frame[];
  style: string;
}

// ── IndexedDB primitives ──

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(FRAMES_STORE)) {
        db.createObjectStore(FRAMES_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wait for a transaction to fully commit. Call this AFTER firing all synchronous requests. */
function txDone(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("IDB transaction aborted"));
  });
}

function get<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function getAll<T>(store: IDBObjectStore, query?: IDBKeyRange): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll(query);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function frameKey(scope: string, num: number) {
  return `${scope}:${num}`;
}

function scopeRange(scope: string): IDBKeyRange {
  return IDBKeyRange.bound(`${scope}:`, `${scope}:\uffff`);
}

function toMeta(f: Frame): FrameMeta {
  return {
    number: f.number,
    promptText: f.promptText,
    acknowledgment: f.acknowledgment,
    suggestions: f.suggestions,
    createdAt: f.createdAt,
  };
}

// ── Full read/write (used for import, load, and initial save) ──

async function writeSession(
  scope: string,
  session: SessionData
): Promise<void> {
  const db = await open();
  const t = db.transaction([META_STORE, FRAMES_STORE], "readwrite");
  const metaStore = t.objectStore(META_STORE);
  const framesStore = t.objectStore(FRAMES_STORE);

  // Queue all requests synchronously — crossing an await boundary between requests
  // causes TransactionInactiveError in Safari (spec-compliant auto-commit).
  const meta: SessionMeta = {
    key: scope,
    title: session.title,
    style: session.style,
    frames: session.frames.map(toMeta),
  };
  metaStore.put(meta);
  framesStore.delete(scopeRange(scope));
  for (const f of session.frames) {
    framesStore.put({ key: frameKey(scope, f.number), html: f.html } satisfies FrameRecord);
  }

  await txDone(t);
  db.close();
}

async function readSession(scope: string): Promise<SessionData | null> {
  const db = await open();
  const t = db.transaction([META_STORE, FRAMES_STORE], "readonly");
  const metaStore = t.objectStore(META_STORE);
  const framesStore = t.objectStore(FRAMES_STORE);

  // For reads we must await each request individually, but reads don't auto-commit
  // (the transaction stays open as long as there are pending requests — and there always is).
  const meta = await get<SessionMeta>(metaStore, scope);
  if (!meta || !meta.frames?.length) {
    db.close();
    return null;
  }

  const records = await getAll<FrameRecord>(framesStore, scopeRange(scope));
  const htmlMap = new Map<string, string>();
  for (const r of records) {
    htmlMap.set(r.key, r.html);
  }

  const frames: Frame[] = meta.frames.map((fm) => ({
    ...fm,
    html: htmlMap.get(frameKey(scope, fm.number)) ?? "",
  }));

  db.close();
  return { title: meta.title, style: meta.style ?? "default", frames };
}

async function deleteSession(scope: string): Promise<void> {
  const db = await open();
  const t = db.transaction([META_STORE, FRAMES_STORE], "readwrite");
  const metaStore = t.objectStore(META_STORE);
  const framesStore = t.objectStore(FRAMES_STORE);

  metaStore.delete(scope);
  framesStore.delete(scopeRange(scope));

  await txDone(t);
  db.close();
}

// ── Incremental operations (O(1) per call) ──

async function appendFrameToScope(
  scope: string,
  session: SessionData,
  frame: Frame
): Promise<void> {
  const db = await open();
  const t = db.transaction([META_STORE, FRAMES_STORE], "readwrite");
  const metaStore = t.objectStore(META_STORE);
  const framesStore = t.objectStore(FRAMES_STORE);

  const meta: SessionMeta = {
    key: scope,
    title: session.title,
    style: session.style,
    frames: session.frames.map(toMeta),
  };
  metaStore.put(meta);
  framesStore.put({ key: frameKey(scope, frame.number), html: frame.html } satisfies FrameRecord);

  await txDone(t);
  db.close();
}

async function removeLastFrameFromScope(
  scope: string,
  session: SessionData,
  removedFrameNumber: number
): Promise<void> {
  const db = await open();
  const t = db.transaction([META_STORE, FRAMES_STORE], "readwrite");
  const metaStore = t.objectStore(META_STORE);
  const framesStore = t.objectStore(FRAMES_STORE);

  const meta: SessionMeta = {
    key: scope,
    title: session.title,
    style: session.style,
    frames: session.frames.map(toMeta),
  };
  metaStore.put(meta);
  framesStore.delete(frameKey(scope, removedFrameNumber));

  await txDone(t);
  db.close();
}

async function updateMetaOnly(
  scope: string,
  session: SessionData
): Promise<void> {
  const db = await open();
  const t = db.transaction([META_STORE], "readwrite");
  const metaStore = t.objectStore(META_STORE);

  const meta: SessionMeta = {
    key: scope,
    title: session.title,
    style: session.style,
    frames: session.frames.map(toMeta),
  };
  metaStore.put(meta);

  await txDone(t);
  db.close();
}

// ── Public API ──

export async function saveSession(session: SessionData): Promise<void> {
  await writeSession(SESSION_KEY, session);
}

export async function loadSession(): Promise<SessionData | null> {
  return readSession(SESSION_KEY);
}

export async function clearSession(): Promise<void> {
  await deleteSession(SESSION_KEY);
}

export async function saveAutosave(session: SessionData): Promise<void> {
  await writeSession(AUTOSAVE_KEY, session);
}

export async function loadAutosave(): Promise<SessionData | null> {
  return readSession(AUTOSAVE_KEY);
}

export async function clearAutosave(): Promise<void> {
  await deleteSession(AUTOSAVE_KEY);
}

export async function appendFrame(
  session: SessionData,
  frame: Frame
): Promise<void> {
  await appendFrameToScope(SESSION_KEY, session, frame);
}

export async function appendFrameAutosave(
  session: SessionData,
  frame: Frame
): Promise<void> {
  await appendFrameToScope(AUTOSAVE_KEY, session, frame);
}

export async function removeLastFrame(
  session: SessionData,
  removedFrameNumber: number
): Promise<void> {
  await removeLastFrameFromScope(SESSION_KEY, session, removedFrameNumber);
}

export async function removeLastFrameAutosave(
  session: SessionData,
  removedFrameNumber: number
): Promise<void> {
  await removeLastFrameFromScope(AUTOSAVE_KEY, session, removedFrameNumber);
}

export async function saveSessionMeta(session: SessionData): Promise<void> {
  await updateMetaOnly(SESSION_KEY, session);
}

export async function loadFrameHtml(
  frameNumber: number,
  scope: string = SESSION_KEY
): Promise<string> {
  const db = await open();
  const t = db.transaction([FRAMES_STORE], "readonly");
  const store = t.objectStore(FRAMES_STORE);
  const record = await get<FrameRecord>(store, frameKey(scope, frameNumber));
  db.close();
  return record?.html ?? "";
}

export async function saveAutosaveMeta(session: SessionData): Promise<void> {
  await updateMetaOnly(AUTOSAVE_KEY, session);
}

export function migrateFromLocalStorage(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("aop_autosave");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.title && Array.isArray(parsed.frames) && parsed.frames.length > 0) {
      return { style: "default", ...parsed } as SessionData;
    }
  } catch { /* ignore */ }
  return null;
}

export function migrateFromSessionStorage(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("aop_session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.title && Array.isArray(parsed.frames)) {
      return { style: "default", ...parsed } as SessionData;
    }
  } catch { /* ignore */ }
  return null;
}

export function clearLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("aop_autosave");
    sessionStorage.removeItem("aop_session");
  } catch { /* ignore */ }
}
