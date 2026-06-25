{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/26.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [
            (import ./overlays/spacetimedb.nix)
          ];
        };

      in
      {
        packages = { };

        devShells.default = with pkgs;
          mkShell {
            buildInputs = [
              nodejs_26
              pnpm
              typescript
              typescript-language-server
              svelte-language-server
              prettier
              esbuild
              spacetimedb

              # Brand / share-asset pipeline (see assets/README.md):
              # render SVG sources → favicons + Open Graph image.
              resvg # headless SVG → PNG (full filter support, deterministic)
              fontconfig # fc-list / fc-cache — verify a font resolved before rendering
              imagemagick # multi-size .ico assembly
              oxipng # lossless PNG shrink for the served images
              pngquant # lossy PNG shrink when smaller wins
              svgo # tidy/optimise the SVG sources
              shot-scraper # headless-Chromium screenshots (render the real app/HTML)
            ];
          };
      });
}
