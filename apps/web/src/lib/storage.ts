/**
 * Safe access to localStorage for small UI preferences (theme, sidebar). Storage can be unavailable
 * (private browsing, quotas); preferences then simply do not persist.
 */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore: the preference just will not survive a reload.
  }
}
