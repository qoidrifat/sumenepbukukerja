import { useEffect, useState } from "react";

export type OfflineMutation = {
  id: string;
  type: "favorite" | "availability" | "interaction";
  payload: Record<string, unknown>;
  createdAt: number;
};

const QUEUE_KEY = "sumenep-buku-kerja-offline-queue";
const QUEUE_EVENT = "sumenep-offline-queue-updated";
type OfflineHandlers = Partial<Record<OfflineMutation["type"], (payload: Record<string, unknown>) => Promise<void>>>;
let registeredHandlers: OfflineHandlers = {};

export function registerOfflineHandlers(handlers: OfflineHandlers) {
  registeredHandlers = { ...registeredHandlers, ...handlers };
}

function readQueue(): OfflineMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is OfflineMutation =>
      typeof item?.id === "string" &&
      typeof item?.type === "string" &&
      typeof item?.payload === "object" &&
      item.payload !== null,
    ).slice(0, 100);
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineMutation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-100)));
  } catch {
    // Private browsing can reject storage; the online path still works.
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function enqueueOfflineMutation(type: OfflineMutation["type"], payload: Record<string, unknown>) {
  const queue = readQueue();
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  queue.push({ id, type, payload, createdAt: Date.now() });
  writeQueue(queue);
  return id;
}

export function pendingOfflineMutations() {
  return readQueue();
}

export function removeOfflineMutation(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export async function flushOfflineQueue(handlers: OfflineHandlers = {}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, remaining: readQueue().length };
  const effectiveHandlers = { ...registeredHandlers, ...handlers };
  let synced = 0;
  for (const item of readQueue()) {
    const handler = effectiveHandlers[item.type];
    if (!handler) continue;
    try {
      await handler(item.payload);
      removeOfflineMutation(item.id);
      synced += 1;
    } catch {
      // Keep the item for the next online event. Newer records remain queued.
      break;
    }
  }
  return { synced, remaining: readQueue().length };
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<OfflineMutation[]>(() => readQueue());
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const refresh = () => setQueue(readQueue());
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_REQUESTED") void flushOfflineQueue();
    };
    window.addEventListener(QUEUE_EVENT, refresh);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
  return { queue, pendingCount: queue.length, online };
}
