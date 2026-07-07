#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/5] Go tests"
(cd "$repo_root/vegad" && GOCACHE=/tmp/vega-gocache go test ./...)

echo "[2/5] Typecheck"
(cd "$repo_root/vega" && npm run typecheck)

echo "[3/5] Renderer build"
(cd "$repo_root/vega" && npm run build)

echo "[4/5] Packaging metadata"
bash -n "$repo_root/scripts/build-local-packages.sh"
(cd "$repo_root/packaging/vegad" && makepkg --printsrcinfo >/dev/null)
(cd "$repo_root/packaging/vega" && makepkg --printsrcinfo >/dev/null)

echo "[5/5] D-Bus contract files"
for file in "$repo_root"/dbus/org.lyraos.Vega1.*.xml; do
  [[ -f "$file" ]]
done

echo "Smoke local concluído"
