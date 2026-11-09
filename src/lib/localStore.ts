import type { Client, Order, Settings, Ticket } from "./types";

/** Everything the app keeps when running in browser-only mode. */
export interface LocalSnapshot {
  tickets: Record<string, Ticket>;
  orders: Record<string, Order>;
  clients: Record<string, Client>;
  settings?: Partial<Settings>;
  myName?: string;
}

export const LOCAL_KEY = "csd:data:v1";

export function loadLocal(): LocalSnapshot {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<LocalSnapshot>;
      return { tickets: v.tickets ?? {}, orders: v.orders ?? {}, clients: v.clients ?? {}, settings: v.settings, myName: v.myName };
    }
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return { tickets: {}, orders: {}, clients: {} };
}

/** Returns false if the browser refused to save (blocked storage or quota full). */
export function saveLocal(s: LocalSnapshot): boolean {
  try {
    const json = JSON.stringify(s);
    // Skip identical writes so tabs reloading each other's saves don't loop.
    if (localStorage.getItem(LOCAL_KEY) === json) return true;
    localStorage.setItem(LOCAL_KEY, json);
    return true;
  } catch {
    return false;
  }
}
