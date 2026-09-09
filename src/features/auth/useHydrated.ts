import { useEffect, useState } from "react";

/**
 * False during server rendering and until React has hydrated, true after.
 *
 * Forms whose submit handler lives in JavaScript are plain HTML until then, so
 * pressing enter early does a native GET: the page reloads, the field empties,
 * and nothing tells the user their sign-in was never requested. On a slow phone
 * — the device this app is built for — that window is seconds long, not
 * milliseconds.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
