// ── Privacy-friendly analytics (Umami) ──────────────────────────────────────
// We load Umami — a cookieless analytics tracker that stores nothing in the
// browser and collects no data that identifies a player — only when a website
// id is configured (VITE_UMAMI_WEBSITE_ID). In local dev that id is unset, so
// nothing loads and track() is a silent no-op. Umami auto-counts one pageview
// per load (the "visit"); on top of that we record a few coarse gameplay
// milestones via track(). We NEVER pass anything that identifies a player
// (no email, name, or id) — only generic event names. See docs/PRIVACY.md.

const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
const SRC =
  (import.meta.env.VITE_UMAMI_SRC as string | undefined) ??
  "https://cloud.umami.is/script.js";

interface Umami {
  track(name: string, data?: Record<string, unknown>): Promise<unknown> | void;
}
declare global {
  interface Window {
    umami?: Umami;
  }
}

// Inject the Umami tracker once, at startup. No-ops when no id is configured
// (local dev) or when the script is already present. Loaded async + deferred so
// it never blocks the game from rendering.
export function initAnalytics(): void {
  if (!WEBSITE_ID) return;
  if (document.querySelector("script[data-website-id]")) return;
  const s = document.createElement("script");
  s.src = SRC;
  s.async = true;
  s.defer = true;
  s.setAttribute("data-website-id", WEBSITE_ID);
  document.head.appendChild(s);
}

// Record a coarse gameplay milestone. A no-op until Umami has loaded (and in
// dev, where it never loads), so call sites never need to guard. Returns a
// promise that settles when the event has been sent, so a caller about to
// navigate away (e.g. the sign-in reload) can await it. Keep names <= 50 chars
// (Umami's event-name limit).
export function track(
  name: string,
  data?: Record<string, unknown>,
): Promise<unknown> {
  try {
    return Promise.resolve(window.umami?.track(name, data));
  } catch {
    return Promise.resolve();
  }
}
