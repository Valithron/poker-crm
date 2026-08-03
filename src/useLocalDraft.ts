import { useEffect, useRef, useState } from "react";

interface DraftEnvelope<T> {
  savedAt: string;
  value: T;
}

export function useLocalDraft<T>(key: string, initialValue: T) {
  const [draft, setDraft] = useState({
    key,
    value: initialValue,
    savedAt: null as string | null,
    hydrated: false,
  });
  const skipSaveRef = useRef(false);

  useEffect(() => {
    let value = initialValue;
    let savedAt: string | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const envelope = JSON.parse(raw) as DraftEnvelope<T>;
        value = envelope.value;
        savedAt = envelope.savedAt;
      }
    } catch {
      // Drafts are an enhancement; storage failures must not block the app.
    } finally {
      setDraft({ key, value, savedAt, hydrated: true });
    }
  }, [initialValue, key]);

  useEffect(() => {
    if (!draft.hydrated || draft.key !== key) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    try {
      const nextSavedAt = new Date().toISOString();
      window.localStorage.setItem(key, JSON.stringify({ savedAt: nextSavedAt, value: draft.value }));
    } catch {
      // Ignore quota/private-mode failures and keep the in-memory value.
    }
  }, [draft.hydrated, draft.key, draft.value, key]);

  function clear() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
    skipSaveRef.current = true;
    setDraft((current) => ({ ...current, savedAt: null, value: initialValue }));
  }

  return {
    value: draft.value,
    setValue: (next: T | ((current: T) => T)) =>
      setDraft((current) => ({ ...current, value: typeof next === "function" ? (next as (current: T) => T)(current.value) : next })),
    savedAt: draft.savedAt,
    hydrated: draft.hydrated && draft.key === key,
    clear,
  };
}
