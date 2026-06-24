"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm: ConfirmFn = useCallback((opts) => {
    const normalized = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setState({ opts: normalized, resolve });
    });
  }, []);

  function handle(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => handle(false)}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {state.opts.title && (
              <h2 className="text-base font-semibold text-gray-900">{state.opts.title}</h2>
            )}
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
              {state.opts.message}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => handle(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-100 transition text-gray-700"
              >
                {state.opts.cancelLabel ?? "Отмена"}
              </button>
              <button
                onClick={() => handle(true)}
                className={`px-4 py-2 text-sm rounded-lg text-white transition font-medium ${
                  state.opts.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-gray-900 hover:bg-gray-700"
                }`}
              >
                {state.opts.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
