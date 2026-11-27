export function readStored(key, fallback, storage) {
  try {
    return JSON.parse((storage ?? localStorage).getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function updateStored(key, update, fallback, storage) {
  // Another tab may have written since this tab last rendered.
  const latest = readStored(key, fallback, storage);
  const next = typeof update === "function" ? update(latest) : update;
  try {
    (storage ?? localStorage).setItem(key, JSON.stringify(next));
  } catch {
    // The caller keeps the update in memory if storage is unavailable.
  }
  return next;
}
