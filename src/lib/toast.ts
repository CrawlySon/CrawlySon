// Jednoduchý in-app toast systém (bez závislostí).
// showToast() vyšle udalosť, ktorú zobrazí komponent <Toaster /> v layoute.

export type Toast = {
  id: number;
  emoji?: string;
  title: string;
  body?: string;
};

type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function showToast(t: Omit<Toast, "id">): void {
  const full: Toast = { ...t, id: ++seq };
  for (const l of listeners) l(full);
}

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
