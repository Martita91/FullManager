import { useEffect, useState } from "react";

/** Chrome's install event, which isn't in the standard DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the service worker and exposes the browser's install prompt.
 *
 * `canInstall` is false on iOS, which has no install event at all — Safari
 * requires the user to pick "Add to Home Screen" from the share menu. Rather
 * than fake a button that does nothing there, callers should only show the
 * prompt when this says it will work.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      // Failure here is not worth surfacing: the app works fine without it,
      // it just can't be installed.
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS reports installed state on navigator, not via display-mode.
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return { canInstall: deferred !== null, installed, install };
}
