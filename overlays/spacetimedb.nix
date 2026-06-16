# @update github-release clockworklabs/SpacetimeDB
# SpacetimeDB - distributed database with intelligent modules
#
# To update to the latest version:
# 1. Check latest release:
#    curl -s https://api.github.com/repos/clockworklabs/SpacetimeDB/releases/latest | jq -r '.tag_name'
#
# 2. Update the version number below (without the 'v' prefix)
#
# 3. Get hashes for each platform:
#    For x86_64-darwin:
#      curl -sL https://github.com/clockworklabs/SpacetimeDB/releases/download/vVERSION/spacetime-x86_64-apple-darwin.tar.gz | nix hash file --sri --type sha256 /dev/stdin
#    For aarch64-darwin:
#      curl -sL https://github.com/clockworklabs/SpacetimeDB/releases/download/vVERSION/spacetime-aarch64-apple-darwin.tar.gz | nix hash file --sri --type sha256 /dev/stdin
#    For x86_64-linux:
#      curl -sL https://github.com/clockworklabs/SpacetimeDB/releases/download/vVERSION/spacetime-x86_64-unknown-linux-gnu.tar.gz | nix hash file --sri --type sha256 /dev/stdin
#    For aarch64-linux:
#      curl -sL https://github.com/clockworklabs/SpacetimeDB/releases/download/vVERSION/spacetime-aarch64-unknown-linux-gnu.tar.gz | nix hash file --sri --type sha256 /dev/stdin
#
# 4. Update the hashes below
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
    version = "2.5.0";

    src = prev.fetchurl (
      if prev.stdenv.hostPlatform.system == "x86_64-darwin" then {
        url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/spacetime-x86_64-apple-darwin.tar.gz";
        hash = "sha256-2GaJZ2kpAMb7c6IYCHSQSFFWKcHSP7+nbDVXiOLSJ0w=";
      }
      else if prev.stdenv.hostPlatform.system == "aarch64-darwin" then {
        url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/spacetime-aarch64-apple-darwin.tar.gz";
        hash = "sha256-Cz0mbj8MkfkowFHoJEd+qUHp+ImVKSmf41d7l/puTi0=";
      }
      else if prev.stdenv.hostPlatform.system == "x86_64-linux" then {
        url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/spacetime-x86_64-unknown-linux-gnu.tar.gz";
        hash = "sha256-fI1kJNAJKi2ACKF5lEvIMCqtR/peIdG6Y2X2w6Iha7Y=";
      }
      else if prev.stdenv.hostPlatform.system == "aarch64-linux" then {
        url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/spacetime-aarch64-unknown-linux-gnu.tar.gz";
        hash = "sha256-bau056XKRWQ/Xl0txHXHqkBCcm7jb365ewY51xWVi7M=";
      }
      else throw "Unsupported platform: ${prev.stdenv.hostPlatform.system}"
    );

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
      platforms = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
      mainProgram = "spacetime";
    };
  };
}
