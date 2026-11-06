/** Pluggable key-value storage, so the same logic works on web (localStorage)
 * and React Native (AsyncStorage) without either platform leaking into this
 * shared layer. Reads are synchronous — on web that's native; on RN the
 * adapter hydrates an in-memory cache once at startup (before configureStorage
 * is called) and persists writes to AsyncStorage in the background. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let adapter: StorageAdapter | null = null;

export function configureStorage(a: StorageAdapter): void {
  adapter = a;
}

export function getStorage(): StorageAdapter {
  if (!adapter) {
    throw new Error("Storage not configured — call configureStorage() once at app startup.");
  }
  return adapter;
}
