#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/9] Go tests"
(cd "$repo_root/vegad" && GOCACHE=/tmp/vega-gocache GOMODCACHE=/tmp/vega-go-mod go test ./...)

echo "[2/9] Rust formatting, tests and lints"
(cd "$repo_root/vega-gtk" && cargo fmt --check && cargo test --locked && cargo clippy --locked -- -D warnings)

echo "[3/9] Optimized GTK build"
(cd "$repo_root/vega-gtk" && cargo build --release --locked)

echo "[4/9] Qt build, tests and headless smoke"
"$repo_root/scripts/qa-qt.sh"

echo "[5/9] Packaging metadata"
bash -n "$repo_root/scripts/build-local-packages.sh"
bash -n "$repo_root/scripts/install.sh"
test "$(XDG_CURRENT_DESKTOP=KDE VEGA_UI=auto bash "$repo_root/scripts/install.sh" --detect-ui)" = qt
test "$(VEGA_UI=gtk bash "$repo_root/scripts/install.sh" --detect-ui)" = gtk
if command -v makepkg >/dev/null; then
  (cd "$repo_root/packaging/vegad" && makepkg --printsrcinfo >/dev/null)
  (cd "$repo_root/packaging/vega" && makepkg --printsrcinfo >/dev/null)
  (cd "$repo_root/packaging/vega-qt" && makepkg --printsrcinfo >/dev/null)
fi

echo "[6/9] D-Bus contract files"
for file in "$repo_root"/dbus/org.lyraos.Vega1.*.xml; do
  [[ -f "$file" ]]
done

echo "[7/9] Native-package guard"
package_files=(
  "$repo_root/packaging/vega/PKGBUILD"
  "$repo_root/packaging/vega-qt/PKGBUILD"
  "$repo_root/packaging/fedora/vega.spec"
  "$repo_root/packaging/fedora/vega-qt.spec"
  "$repo_root/packaging/opensuse/vega.spec"
  "$repo_root/packaging/opensuse/vega-qt.spec"
  "$repo_root/packaging/debian-src/debian/control"
  "$repo_root/packaging/debian-src/debian/rules"
  "$repo_root/.github/workflows/release-fedora.yml"
  "$repo_root/.github/workflows/release-opensuse.yml"
  "$repo_root/.github/workflows/release-debian.yml"
  "$repo_root/.github/workflows/release-arch.yml"
)
if grep -Ei '(electron|node_modules|npm (ci|install|run)|nodejs)' "${package_files[@]}"; then
  echo "Erro: referência ao runtime legado no pacote GTK" >&2
  exit 1
fi
grep -q 'cmake(Qt6Network)' "$repo_root/packaging/fedora/vega-qt.spec"
grep -q 'cmake(Qt6Network)' "$repo_root/packaging/opensuse/vega-qt.spec"
grep -q '%cmake -S ../vega-qt' "$repo_root/packaging/opensuse/vega-qt.spec"

echo "[8/9] Identidades GTK/Qt independentes"
grep -q 'org.lyraos.VegaQt' "$repo_root/vega-qt/packaging/org.lyraos.VegaQt.desktop"
grep -q 'lyra-vega-qt' "$repo_root/vega-qt/CMakeLists.txt"
grep -q 'lyra-vega-gtk' "$repo_root/vega-gtk/Cargo.toml"

echo "[9/9] Coexistência de arquivos GTK/Qt"
"$repo_root/scripts/check-qt-coexistence.sh"

echo "Smoke local concluído"
