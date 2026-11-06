import type { StorageAdapter } from "../shared/storage";

/** localStorage-backed StorageAdapter for the web build. Web-only — never
 * moves into shared/, since the RN app supplies its own AsyncStorage-backed
 * adapter instead. */
export const webStorage: StorageAdapter = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch { /* storage may be blocked or full */ }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch { /* ignore */ }
  },
};
