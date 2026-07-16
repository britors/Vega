#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${VEGA_QT_BUILD_DIR:-$repo_root/build/vega-qt}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

DESTDIR="$stage/qt" cmake --install "$build_dir" >/dev/null
(cd "$stage/qt" && find . -type f -o -type l) | sed 's#^\.##' | sort >"$stage/qt.files"

cat >"$stage/gtk.files" <<'EOF'
/usr/bin/lyra-vega-gtk
/usr/bin/vega
/usr/share/applications/vega.desktop
/usr/share/icons/hicolor/scalable/apps/vega.svg
EOF
sort -o "$stage/gtk.files" "$stage/gtk.files"

overlap="$(comm -12 "$stage/gtk.files" "$stage/qt.files")"
if [[ -n "$overlap" ]]; then
  echo "Conflito de arquivos GTK/Qt:" >&2
  echo "$overlap" >&2
  exit 1
fi

grep -qx '/usr/bin/lyra-vega-qt' "$stage/qt.files"
grep -qx '/usr/share/applications/org.lyraos.VegaQt.desktop' "$stage/qt.files"
if grep -Eq '/(vegad|lyra-vega-gtk|vega\.desktop)$' "$stage/qt.files"; then
  echo "Pacote Qt contém arquivo pertencente à GTK ou ao daemon" >&2
  exit 1
fi

echo "Coexistência GTK/Qt validada: nenhum caminho compartilhado"
