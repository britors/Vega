#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${VEGA_QT_BUILD_DIR:-$repo_root/build/vega-qt}"

cmake -S "$repo_root/vega-qt" -B "$build_dir" -G Ninja \
  -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr
cmake --build "$build_dir"
ctest --test-dir "$build_dir" --output-on-failure

for platform in offscreen minimal; do
  set +e
  QT_QPA_PLATFORM="$platform" timeout 2s "$build_dir/lyra-vega-qt"
  status=$?
  set -e
  if [[ $status -ne 124 ]]; then
    echo "Smoke Qt falhou na plataforma $platform (status $status)" >&2
    exit 1
  fi
done

echo "QA Qt concluído"
