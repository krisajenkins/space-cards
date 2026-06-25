# Brand / share assets — sources

Editable sources for the favicon and the social-share (Open Graph) preview
image. The *rendered* files that the site actually serves live in `public/`;
regenerate them from here whenever a source changes.

## Files

| Source                | Rendered output(s)                                                  |
| --------------------- | ------------------------------------------------------------------- |
| `assets/og.svg`       | `public/og.png` (1200×630 — the `og:image` / `twitter:image`)       |
| `public/favicon.svg`  | `public/favicon.ico`, `public/apple-touch-icon.png` (source = served SVG) |

The OG card uses **Fraunces** (title), **Hanken Grotesk** (tagline) and **Space
Mono** (labels) — the same faces as the app. They must be installed locally for
the render to look right (`~/Library/Fonts` on macOS). Check a face resolved
before rendering with `fc-list | grep -i fraunces`.

The card icons are vector glyphs lifted verbatim from `src/lib/catalogue.ts`
(not emoji), so the render has no colour-emoji-font dependency and looks
identical across renderers.

All tooling below (`resvg`, `magick`, `oxipng`, `fc-list`) comes from the Nix
devShell — run `direnv reload` / `nix develop` first.

## Regenerate

```bash
# OG image (resvg has full filter support and explicit font control)
resvg assets/og.svg public/og.png --width 1200 \
      --use-fonts-dir ~/Library/Fonts
oxipng -o max public/og.png          # lossless shrink of the served image

# Favicons (from public/favicon.svg)
resvg public/favicon.svg public/apple-touch-icon.png --width 180
resvg public/favicon.svg /tmp/f48.png --width 48
magick /tmp/f48.png -define icon:auto-resize=48,32,16 public/favicon.ico
```
