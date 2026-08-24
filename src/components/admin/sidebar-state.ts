"use client";

/**
 * The sidebar's collapsed flag, kept in `localStorage`.
 *
 * Exposed as an external store rather than as `useState` plus an effect that
 * reads storage after mount. `localStorage` genuinely *is* an external store,
 * and `useSyncExternalStore` is the API for one: it renders the server value
 * during hydration, swaps to the stored value on the client without an extra
 * effect pass, and keeps every subscriber in step if the preference is ever
 * changed from two places.
 */
const KEY = "edupilot.admin.sidebar.collapsed";

const listeners = new Set<() => void>();

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab changing the preference should move this one too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Returns a boolean, so React's identity check on the snapshot is a value
 * comparison — reading storage on every render is safe precisely because of
 * that. A snapshot returning a fresh object would loop.
 */
export function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode, or site data blocked. The default width is a fine answer.
    return false;
  }
}

/** The server has no storage; expanded is the sensible default to render. */
export function getServerSnapshot(): boolean {
  return false;
}

export function setCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Not being able to remember it is no reason to refuse to do it — but the
    // store then has nothing to read back, so notify with what we were told.
  }
  for (const listener of listeners) listener();
}
