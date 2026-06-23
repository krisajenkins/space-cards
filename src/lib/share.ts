// ── Sharing ───────────────────────────────────────────────────────────────────
// The share buttons (the in-game topbar and the Finale outro) open a small
// popover of per-network share links rather than the native OS share sheet.
// These builders turn a bit of share copy + the current page URL into the
// intent/compose URLs each network expects. The URL is always read from
// `window.location.href` at call time — never hardcoded — so it tracks whatever
// domain the game is deployed to.

const enc = encodeURIComponent;

export type ShareLink = { label: string; href: string };

// Build the ordered list of network share links for a piece of share copy.
// Read the page URL at call time so it tracks the deployed domain.
export function shareLinks({ text }: { text: string }): ShareLink[] {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const textAndUrl = `${text} ${url}`;
  return [
    {
      label: "X / Twitter",
      href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
    },
    {
      label: "Bluesky",
      href: `https://bsky.app/intent/compose?text=${enc(textAndUrl)}`,
    },
    {
      // A relay that prompts for the user's own instance, so we don't hardcode one.
      label: "Mastodon",
      href: `https://mastodonshare.com/?text=${enc(text)}&url=${enc(url)}`,
    },
    {
      // LinkedIn ignores prefilled text — URL only.
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    },
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${enc(textAndUrl)}`,
    },
  ];
}

// Copy the current page URL to the clipboard. Returns whether it succeeded so
// the caller can flash a transient "Link copied!" confirmation.
export async function copyLink(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = window.location.href;
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
