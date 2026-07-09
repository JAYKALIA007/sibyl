// A tiny pub-sub for connection-level faults (5xx / network). The runtime adapter
// runs inside assistant-ui, so it can't set React state directly — it publishes
// here, and the top-level banner subscribes. Domain outcomes (answer/refused/error)
// never touch this; only genuine faults do.

type Listener = (message: string | null) => void

const listeners = new Set<Listener>()

export const faultBus = {
  emit(message: string | null): void {
    for (const l of listeners) l(message)
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}
