#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
image="${VEGA_DEBIAN_IMAGE:-ubuntu:24.04}"

podman run --rm --security-opt label=disable \
  -v "$repo_root:/src:ro" "$image" bash -euxc '
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential debhelper dpkg-dev fakeroot golang-go cargo rustc pkg-config \
  libgtk-4-dev libadwaita-1-dev \
  libsecret-tools ca-certificates curl

curl --proto =https --tlsv1.2 -fsS https://sh.rustup.rs -o /tmp/rustup-init.sh
sh /tmp/rustup-init.sh -y --profile minimal --default-toolchain stable
. /root/.cargo/env

mkdir -p /work
tar -C /src --exclude=.git --exclude=build --exclude=vega-gtk/target -cf - . \
  | tar -C /work -xf -
cd /work
cp -r packaging/debian-src/debian .
dpkg-buildpackage -us -uc -b

apt-get install -y /vegad_*.deb /lyra-vega-gtk_*.deb
test -x /usr/bin/lyra-vega-gtk
test -x /usr/lib/vega/vegad
'

echo "Pacotes Debian validados: build e manifesto"
