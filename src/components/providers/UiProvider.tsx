"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface UiContext {
  toast(message: string): void;
  confirm(text: string): Promise<boolean>;
}

const Ctx = createContext<UiContext | null>(null);

export function useUi(): UiContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used inside <UiProvider>");
  return v;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [confirmState, setConfirmState] = useState<{ text: string; resolve: (ok: boolean) => void } | null>(null);

  const toast = useCallback((message: string) => {
    setToastMsg(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const confirm = useCallback(
    (text: string) => new Promise<boolean>((resolve) => setConfirmState({ text, resolve })),
    [],
  );

  const answer = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {confirmState && (
        <div className="modal on" role="dialog" aria-modal="true">
          <div className="box">
            <p>{confirmState.text}</p>
            <div className="bar bar-end">
              <button className="btn" onClick={() => answer(false)}>
                Huỷ
              </button>
              <button className="btn primary" onClick={() => answer(true)} autoFocus>
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`toast ${toastMsg ? "on" : ""}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </Ctx.Provider>
  );
}
