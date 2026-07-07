#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="${LYRA_REPO_DIR:-${1:-}}"
packages=(vegad vega)

for package in "${packages[@]}"; do
  pkgbuild_dir="$repo_root/packaging/$package"

  if [[ ! -f "$pkgbuild_dir/PKGBUILD" ]]; then
    echo "Falha: PKGBUILD de $package nao encontrado em $pkgbuild_dir" >&2
    exit 1
  fi

  echo "Buildando $package a partir de $repo_root"
  (
    cd "$pkgbuild_dir"
    VEGA_SOURCE_DIR="$repo_root" makepkg -f --noconfirm --nodeps
  )

  pkgfile="$(find "$pkgbuild_dir" -maxdepth 1 -name "$package-[0-9]*.pkg.tar.zst" -printf '%T@ %p\n' \
    | sort -rn | head -1 | cut -d' ' -f2-)"

  if [[ -z "$pkgfile" ]]; then
    echo "Falha: $package nao gerou pacote em $pkgbuild_dir" >&2
    exit 1
  fi

  echo "  -> gerado: $pkgfile"

  if [[ -n "$repo_dir" ]]; then
    mkdir -p "$repo_dir"
    cp -f "$pkgfile" "$repo_dir/"
    echo "  -> copiado: $repo_dir/$(basename "$pkgfile")"
  fi
done

if [[ -n "$repo_dir" ]]; then
  echo
  echo "Pacotes copiados para $repo_dir"
  echo "Atualize o banco local com:"
  echo "  repo-add '$repo_dir/lyra.db.tar.gz' '$repo_dir'/*.pkg.tar.zst"
fi
