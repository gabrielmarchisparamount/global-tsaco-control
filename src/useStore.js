import { useEffect, useState } from 'react';

// Subscribes to any of our plain-object stores (backendRegistry, lock) and re-renders on change.
export function useStore(store) {
  const [, setTick] = useState(0);
  useEffect(() => store.onChange(() => setTick((n) => n + 1)), [store]);
  return store;
}
