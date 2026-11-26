"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/** Diálogo modal sobre <dialog>: foco atrapado y cierre con Escape nativos. Montar para abrir. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-lg p-0 text-left whitespace-normal shadow-xl backdrop:bg-navy/60"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <h2 id={titleId} className="text-lg font-semibold text-navy">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
