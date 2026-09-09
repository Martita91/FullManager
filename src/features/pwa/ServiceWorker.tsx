import { useEffect } from "react";

/**
 * Registers the service worker once, for the whole app.
 *
 * This belongs at the root rather than on the player screen: the browser only
 * offers to install a site that has a registered worker, and the person most
 * likely to want the app is someone reading a league's public fixtures — who
 * has no account and never reaches /me.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Failure is not worth surfacing: the app works fine without it, it just
    // can't be installed.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
