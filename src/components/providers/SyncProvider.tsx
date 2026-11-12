"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SyncResult } from "@/lib/types";
import { useData } from "./DataProvider";
import { useUi } from "./UiProvider";

type SyncResponse = { status: "ok"; result: SyncResult; partial: boolean } | { status: "busy" } | { error: string };

interface SyncContext {
  syncing: boolean;
  /** Last error from this browser's sync attempt ("" when the last run worked). */
  syncErr: string;
  /** False when the server has no Gmail sync configured (or browser-only mode). */
  available: boolean;
  auto: boolean;
  setAuto(on: boolean): void;
  runSync(manual: boolean): Promise<void>;
}

const Ctx = createContext<SyncContext | null>(null);

export function useSync(): SyncContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSync must be used inside <SyncProvider>");
  return v;
}

// Same keys as the original app: auto-sync turns itself on after the first successful sync,
// unless the user switched it off.
const AUTO_ON_KEY = "csdAutoOn";
const AUTO_ARMED_KEY = "csdAuto";
const AUTO_MS = 180_000;
const FIRST_RUN_MS = 4_000;

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_ON_KEY) !== "0" && localStorage.getItem(AUTO_ARMED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Gmail sync for the whole app: the "Đồng bộ ngay" button and the 3-minute auto-sync on every page. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const d = useData();
  const { toast } = useUi();
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState("");
  const [available, setAvailable] = useState(d.mode === "cloud");
  const [auto, setAutoState] = useState(false);

  useEffect(() => setAutoState(readAuto()), []);

  const busy = useRef(false);
  const runSync = useCallback(
    async (manual: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setSyncing(true);
      try {
        const res = await fetch("/api/sync", { method: "POST" });
        const r = (await res.json().catch(() => ({ error: `Lỗi đồng bộ ${res.status}` }))) as SyncResponse;
        if (res.status === 501) setAvailable(false);
        if ("error" in r) throw new Error(r.error);
        setSyncErr("");
        if (r.status === "busy") {
          if (manual) toast("Đang có một lần đồng bộ khác chạy, thử lại sau ít phút");
          return;
        }
        try {
          localStorage.setItem(AUTO_ARMED_KEY, "1");
        } catch {}
        setAutoState(readAuto());
        if (manual) {
          const { messages, orders, tickets } = r.result;
          toast(
            `Đã đồng bộ: ${messages} email mới · ${orders} đơn cập nhật · ${tickets} ticket cập nhật` +
              (r.partial ? " — còn email, bấm đồng bộ lần nữa" : ""),
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Lỗi đồng bộ";
        setSyncErr(msg);
        if (manual) toast(msg);
      } finally {
        busy.current = false;
        setSyncing(false);
      }
    },
    [toast],
  );

  const setAuto = useCallback((on: boolean) => {
    try {
      localStorage.setItem(AUTO_ON_KEY, on ? "1" : "0");
      if (on) localStorage.setItem(AUTO_ARMED_KEY, "1");
    } catch {}
    setAutoState(on);
  }, []);

  const enabled = auto && available && d.ready;
  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => runSync(false), FIRST_RUN_MS);
    const id = setInterval(() => !document.hidden && runSync(false), AUTO_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled, runSync]);

  const value = useMemo(
    () => ({ syncing, syncErr, available, auto, setAuto, runSync }),
    [syncing, syncErr, available, auto, setAuto, runSync],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
