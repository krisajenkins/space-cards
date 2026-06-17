# @update github-release clockworklabs/SpacetimeDB
# SpacetimeDB - distributed database with intelligent modules
#
# To update to the latest version:
# 1. Check latest release:
#    curl -s https://api.github.com/repos/clockworklabs/SpacetimeDB/releases/latest | jq -r '.tag_name'
#
# 2. Update the version number below (without the 'v' prefix)
#
# 3. Get the hash (nix-prefetch-url caches into the store, so the build that
#    follows won't re-download):
#      nix hash convert --hash-algo sha256 --to sri \
#        "$(nix-prefetch-url https://github.com/clockworklabs/SpacetimeDB/releases/download/vVERSION/spacetime-aarch64-apple-darwin.tar.gz)"
#
# 4. Update the hash below
#
# 5. Test: nix build .#spacetimedb
#
# Note: Tarball contains two binaries at root level:
#   - spacetimedb-cli (installed as 'spacetime')
#   - spacetimedb-standalone
#
# GitHub: https://github.com/clockworklabs/SpacetimeDB
# Releases: https://github.com/clockworklabs/SpacetimeDB/releases

final: prev: {
  spacetimedb = prev.stdenv.mkDerivation rec {
    pname = "spacetime";
    version = "2.6.0";

    src = prev.fetchurl {
      url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/spacetime-aarch64-apple-darwin.tar.gz";
      hash = "sha256-GkERAmA0Q3BKzy8AXzTTTIjX3FU1Hy56b0HGPDnoaKQ=";
    };

    # No subdirectory in tarball, binaries are at root
    sourceRoot = ".";

    installPhase = ''
      runHook preInstall

      mkdir -p $out/bin

      # Install the CLI binary as 'spacetime' (matching upstream name)
      install -m755 spacetimedb-cli $out/bin/spacetime

      # Install the standalone server
      install -m755 spacetimedb-standalone $out/bin/spacetimedb-standalone

      runHook postInstall
    '';

    meta = with prev.lib; {
      description = "SpacetimeDB CLI and standalone server - a distributed database with intelligent modules";
      homepage = "https://spacetimedb.com";
      license = licenses.bsl11; # Business Source License 1.1 - converts to AGPL-3.0 on 2030-10-31
      platforms = [ "aarch64-darwin" ];
      mainProgram = "spacetime";
    };
  };
}
