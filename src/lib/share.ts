// ── Sharing ───────────────────────────────────────────────────────────────────
// One helper for both share buttons (the in-game topbar and the Finale outro).
// Uses the Web Share API when the browser offers it; otherwise falls back to
// copying the current page URL to the clipboard. The URL is always read from
// `window.location.href` at call time — never hardcoded — so it tracks whatever
// domain the game is deployed to.

export type ShareResult = "shared" | "copied" | "unavailable";

export async function share({
  title,
  text,
}: {
  title: string;
  text: string;
}): Promise<ShareResult> {
  if (typeof window === "undefined") return "unavailable";
  const url = window.location.href;

  // Preferred path: the native share sheet (mobile + some desktops).
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      // The user dismissing the share sheet is not an error — swallow it.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
      // Anything else (e.g. NotAllowedError): fall through to clipboard.
    }
  }

  // Fallback: copy the link so the player can paste it wherever.
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "unavailable";
    }
  }

  return "unavailable";
}
