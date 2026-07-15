#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/6] Go tests"
(cd "$repo_root/vegad" && GOCACHE=/tmp/vega-gocache GOMODCACHE=/tmp/vega-go-mod go test ./...)

echo "[2/6] Rust formatting, tests and lints"
(cd "$repo_root/vega-gtk" && cargo fmt --check && cargo test --locked && cargo clippy --locked -- -D warnings)

echo "[3/6] Optimized GTK build"
(cd "$repo_root/vega-gtk" && cargo build --release --locked)

echo "[4/6] Packaging metadata"
bash -n "$repo_root/scripts/build-local-packages.sh"
if command -v makepkg >/dev/null; then
  (cd "$repo_root/packaging/vegad" && makepkg --printsrcinfo >/dev/null)
  (cd "$repo_root/packaging/vega" && makepkg --printsrcinfo >/dev/null)
fi

echo "[5/6] D-Bus contract files"
for file in "$repo_root"/dbus/org.lyraos.Vega1.*.xml; do
  [[ -f "$file" ]]
done

echo "[6/6] Native-package guard"
package_files=(
  "$repo_root/packaging/vega/PKGBUILD"
  "$repo_root/packaging/fedora/vega.spec"
  "$repo_root/packaging/opensuse/vega.spec"
  "$repo_root/packaging/debian-src/debian/control"
  "$repo_root/packaging/debian-src/debian/rules"
  "$repo_root/.github/workflows/release-fedora.yml"
  "$repo_root/.github/workflows/release-opensuse.yml"
  "$repo_root/.github/workflows/release-debian.yml"
)
if grep -Ei '(electron|node_modules|npm (ci|install|run)|nodejs)' "${package_files[@]}"; then
  echo "Erro: referência ao runtime legado no pacote GTK" >&2
  exit 1
fi

echo "Smoke local concluído"
