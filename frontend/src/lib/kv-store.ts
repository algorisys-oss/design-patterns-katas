// Tiny promise-based key–value store backed by IndexedDB, with a localStorage
// fallback for environments where IndexedDB is unavailable (SSR, some private-mode
// browsers). Dependency-free and generic so other features — e.g. syncing learner
// progress to the SkillzEngine LMS — can reuse the same store. Values are arbitrary
// JSON; keys are strings.

export interface KvStore {
  getAll(): Promise<Record<string, unknown>>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IdbStore implements KvStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor(private dbName: string, private storeName: string) {
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return this.dbPromise.then((db) => db.transaction(this.storeName, mode).objectStore(this.storeName));
  }

  async getAll(): Promise<Record<string, unknown>> {
    const store = await this.store("readonly");
    return new Promise((resolve, reject) => {
      const out: Record<string, unknown> = {};
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out[String(cursor.key)] = cursor.value;
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async get(key: string): Promise<unknown> {
    return promisify((await this.store("readonly")).get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    await promisify((await this.store("readwrite")).put(value, key));
  }

  async remove(key: string): Promise<void> {
    await promisify((await this.store("readwrite")).delete(key));
  }

  async clear(): Promise<void> {
    await promisify((await this.store("readwrite")).clear());
  }
}

class LocalStore implements KvStore {
  constructor(private prefix: string) {}

  private keyed(key: string): string {
    return `${this.prefix}:${key}`;
  }

  getAll(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    if (typeof localStorage === "undefined") return Promise.resolve(out);
    const head = `${this.prefix}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(head)) {
        try {
          out[k.slice(head.length)] = JSON.parse(localStorage.getItem(k) as string);
        } catch {
          /* skip unparseable */
        }
      }
    }
    return Promise.resolve(out);
  }

  get(key: string): Promise<unknown> {
    if (typeof localStorage === "undefined") return Promise.resolve(undefined);
    const raw = localStorage.getItem(this.keyed(key));
    try {
      return Promise.resolve(raw == null ? undefined : JSON.parse(raw));
    } catch {
      return Promise.resolve(undefined);
    }
  }

  set(key: string, value: unknown): Promise<void> {
    if (typeof localStorage !== "undefined") localStorage.setItem(this.keyed(key), JSON.stringify(value));
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    if (typeof localStorage !== "undefined") localStorage.removeItem(this.keyed(key));
    return Promise.resolve();
  }

  clear(): Promise<void> {
    if (typeof localStorage === "undefined") return Promise.resolve();
    const head = `${this.prefix}:`;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(head)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
    return Promise.resolve();
  }
}

/** Open a KV store — IndexedDB when available, else a localStorage-backed shim. */
export function createKvStore(dbName: string, storeName: string): KvStore {
  return idbAvailable() ? new IdbStore(dbName, storeName) : new LocalStore(`${dbName}:${storeName}`);
}
