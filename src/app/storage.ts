/** Per-viewer conveniences in localStorage. Every access is guarded: storage may be unavailable. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(`v2xlab:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(`v2xlab:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}
