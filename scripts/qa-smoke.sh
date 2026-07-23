#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/7] Go tests"
(cd "$repo_root/vegad" && GOCACHE=/tmp/vega-gocache GOMODCACHE=/tmp/vega-go-mod go test ./...)

echo "[2/7] Rust formatting, tests and lints"
(cd "$repo_root/vega-gtk" && cargo fmt --check && cargo test --locked && cargo clippy --locked -- -D warnings)

echo "[3/7] Optimized GTK build"
(cd "$repo_root/vega-gtk" && cargo build --release --locked)

echo "[4/7] Packaging metadata"
bash -n "$repo_root/scripts/install.sh"

echo "[5/7] D-Bus contract files"
for file in "$repo_root"/dbus/org.lyraos.Vega1.*.xml; do
  [[ -f "$file" ]]
done

echo "[6/7] Native-package guard"
package_files=(
  "$repo_root/packaging/opensuse/vega.spec"
  "$repo_root/packaging/obs"/*.spec
  "$repo_root/.github/workflows/release-opensuse.yml"
)
if grep -Ei '(electron|node_modules|npm (ci|install|run)|nodejs)' "${package_files[@]}"; then
  echo "Erro: referência ao runtime legado no pacote GTK" >&2
  exit 1
fi
# openSUSE usa o rust/cargo do próprio zypper direto, sem
# dtolnay/rust-toolchain — já foi tentado (release v4.0.0) e quebrou com
# `exec: "bash": executable file not found in $PATH` dentro do container
# opensuse/leap, incompatibilidade real confirmada em CI, não teórica. Não
# reintroduzir essa action no workflow do openSUSE.

echo "[7/7] Identidade GTK"
grep -q 'vega-gtk' "$repo_root/vega-gtk/Cargo.toml"

echo "Smoke local concluído"
