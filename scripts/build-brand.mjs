// Build the brand / share assets end-to-end: sync the glyph geometry into the
// favicon + Open Graph sources, then render the PNG/ICO outputs the site serves.
//
// The card glyphs are authored once, as individual documents under
// src/assets/glyphs/<name>.svg (the same files the app renders). The favicon and
// the Open Graph card embed a few of those glyphs too — historically as verbatim
// copies of the path data, which drifted from the canonical glyph whenever it was
// retouched. Step 1 re-stamps the canonical geometry into the `<g id="gl-*">`
// blocks of public/favicon.svg and assets/og.svg, so there is one place to edit a
// glyph. Step 2 renders those sources to public/ with resvg/oxipng/magick.
//
// The sync preserves each block's own wrapper attributes (the brand colour, stroke
// width and any transform are presentation choices that belong to the asset) and
// resolves the glyph's `currentColor` accents to that block's stroke colour, so
// the rendered files stay explicit-coloured and need no currentColor support.
//
// Render tooling (resvg, oxipng, magick) comes from the Nix devShell — run
// `direnv reload` / `nix develop` first, or this fails fast with guidance.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Step 1: sync glyph geometry into the brand sources ──────────────────────

// Which canonical glyph backs each `<g id="gl-NAME">`. The id stem is the glyph
// name, so the map is just the set of glyphs these assets use.
const USED = ["effort", "survivor", "wreck"];

// The drawing markup of a canonical glyph file: everything inside its <svg>,
// minus the metadata Inkscape sprinkles in on save (an empty <defs>, the
// <sodipodi:namedview>, <metadata>, comments). Those are editor bookkeeping, not
// geometry, and must not leak into the brand assets.
function innerOf(name) {
  const file = resolve(root, `src/assets/glyphs/${name}.svg`);
  const svg = readFileSync(file, "utf8");
  const m = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/);
  if (!m) throw new Error(`no <svg> body in ${file}`);
  return m[1]
    .replace(/<defs\b[^>]*\/>/g, "")
    .replace(/<defs\b[\s\S]*?<\/defs>/g, "")
    .replace(/<sodipodi:namedview\b[^>]*\/>/g, "")
    .replace(/<sodipodi:namedview\b[\s\S]*?<\/sodipodi:namedview>/g, "")
    .replace(/<metadata\b[\s\S]*?<\/metadata>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*[\r\n]/gm, "") // drop blank lines left behind
    .trim();
}

// Pull the stroke colour declared on a `<g id="gl-NAME" …>` open tag, so we can
// resolve the glyph's currentColor accents to match the block's own tint.
function strokeOf(openTag, id) {
  const m = openTag.match(/\bstroke="([^"]+)"/);
  if (!m) throw new Error(`#${id} has no stroke colour to resolve currentColor to`);
  return m[1];
}

// Indent canonical inner markup to sit nicely under the `<g>`.
function indent(markup, pad) {
  return markup
    .split("\n")
    .map((l) => (l.trim() ? pad + l.trim() : l))
    .join("\n");
}

function sync(relPath, pad) {
  const file = resolve(root, relPath);
  let src = readFileSync(file, "utf8");
  let touched = 0;

  for (const name of USED) {
    const id = `gl-${name}`;
    // Match the whole block: `<g … id="gl-NAME" …> … </g>` (no nested <g> inside).
    const re = new RegExp(`(<g\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</g>)`);
    const block = src.match(re);
    if (!block) continue; // asset doesn't use this glyph
    const [, openTag] = block;
    const inner = innerOf(name).replaceAll("currentColor", strokeOf(openTag, id));
    const body = `\n${indent(inner, pad)}\n${pad.slice(0, -2)}`;
    src = src.replace(re, `$1${body}$3`);
    touched++;
  }

  writeFileSync(file, src);
  console.log(`synced ${touched} glyph(s) into ${relPath}`);
}

// ── Step 2: render the served outputs ───────────────────────────────────────

function which(tool) {
  try {
    execFileSync("command", ["-v", tool], { shell: "/bin/bash", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args) {
  console.log(`  ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
}

function render() {
  const need = ["resvg", "oxipng", "magick"];
  const missing = need.filter((t) => !which(t));
  if (missing.length) {
    console.error(
      `\nMissing render tool(s): ${missing.join(", ")}.\n` +
        `These come from the Nix devShell — run \`direnv reload\` (or \`nix develop\`) and retry.`,
    );
    process.exit(1);
  }

  const f48 = join(tmpdir(), "spacecards-favicon-48.png");
  // resvg picks up the app's faces from the user font dir when one exists
  // (macOS); elsewhere it falls back to fontconfig.
  const fonts = join(homedir(), "Library", "Fonts");
  const fontArgs = existsSync(fonts) ? ["--use-fonts-dir", fonts] : [];

  console.log("rendering og.png …");
  run("resvg", ["assets/og.svg", "public/og.png", "--width", "1200", ...fontArgs]);
  run("oxipng", ["-o", "max", "public/og.png"]);

  console.log("rendering favicons …");
  run("resvg", ["public/favicon.svg", "public/apple-touch-icon.png", "--width", "180"]);
  run("resvg", ["public/favicon.svg", f48, "--width", "48"]);
  run("magick", [f48, "-define", "icon:auto-resize=48,32,16", "public/favicon.ico"]);
}

sync("public/favicon.svg", "      ");
sync("assets/og.svg", "      ");
render();
console.log("brand assets built.");
