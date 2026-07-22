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
bash -n "$repo_root/scripts/build-local-packages.sh"
bash -n "$repo_root/scripts/install.sh"
bash -n "$repo_root/scripts/validate-debian-packages.sh"
if command -v makepkg >/dev/null; then
  (cd "$repo_root/packaging/vegad" && makepkg --printsrcinfo >/dev/null)
  (cd "$repo_root/packaging/vega" && makepkg --printsrcinfo >/dev/null)
fi

echo "[5/7] D-Bus contract files"
for file in "$repo_root"/dbus/org.lyraos.Vega1.*.xml; do
  [[ -f "$file" ]]
done

echo "[6/7] Native-package guard"
package_files=(
  "$repo_root/packaging/vega/PKGBUILD"
  "$repo_root/packaging/fedora/vega.spec"
  "$repo_root/packaging/opensuse/vega.spec"
  "$repo_root/packaging/debian-src/debian/control"
  "$repo_root/packaging/debian-src/debian/rules"
  "$repo_root/.github/workflows/release-fedora.yml"
  "$repo_root/.github/workflows/release-opensuse.yml"
  "$repo_root/.github/workflows/release-debian.yml"
  "$repo_root/.github/workflows/release-arch.yml"
  "$repo_root/scripts/validate-debian-packages.sh"
)
if grep -Ei '(electron|node_modules|npm (ci|install|run)|nodejs)' "${package_files[@]}"; then
  echo "Erro: referência ao runtime legado no pacote GTK" >&2
  exit 1
fi
# Só Fedora e Debian pinam o toolchain via dtolnay/rust-toolchain (as
# imagens desses containers têm rust do sistema desatualizado demais pra
# esse projeto). Arch e openSUSE usam o rust/cargo do próprio gerenciador
# de pacotes direto — openSUSE especificamente NÃO deve ganhar essa action
# de volta: já foi tentado (release v4.0.0) e quebrou com
# `exec: "bash": executable file not found in $PATH` dentro do container
# opensuse/leap, incompatibilidade real confirmada em CI, não teórica.
for workflow in release-fedora.yml release-debian.yml; do
  grep -q 'dtolnay/rust-toolchain@stable' "$repo_root/.github/workflows/$workflow"
done

echo "[7/7] Identidade GTK"
grep -q 'vega-gtk' "$repo_root/vega-gtk/Cargo.toml"

echo "Smoke local concluído"
