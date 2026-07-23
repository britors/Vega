#!/usr/bin/env bash
# Instalador de conveniência: baixa os pacotes RPM pré-compilados da release
# mais recente do Vega (via .github/workflows/release-opensuse.yml) e
# instala com zypper. Cobre só openSUSE Leap.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
#
# VEGA_VERSION=v1.3.4 sudo -E bash install.sh    # trava numa tag específica
# VEGA_CLI_ONLY=1 sudo -E bash install.sh        # só vegad + vega-cli, sem
#                                                 # a interface GTK (e sem
#                                                 # puxar gtk4/libadwaita) —
#                                                 # pensado pra servidor
#                                                 # headless administrado só
#                                                 # por SSH.
set -euo pipefail

REPO="britors/Vega"
VEGA_CLI_ONLY="${VEGA_CLI_ONLY:-0}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (sudo bash install.sh, ou via curl ... | sudo bash)." >&2
  exit 1
fi

distro_id=""
distro_id_like=""
if [ -r /etc/os-release ]; then
  . /etc/os-release
  distro_id="${ID:-}"
  distro_id_like="${ID_LIKE:-}"
fi

# download_release_assets baixa pra $workdir todo asset da release cujo nome
# termina no sufixo passado (".rpm"), usando a API de releases do GitHub.
download_release_assets() {
  local suffix="$1"
  local release_tag="${VEGA_VERSION:-latest}"
  local api_url
  if [ "$release_tag" = "latest" ]; then
    api_url="https://api.github.com/repos/$REPO/releases/latest"
  else
    api_url="https://api.github.com/repos/$REPO/releases/tags/$release_tag"
  fi

  echo "==> Consultando release ($release_tag) em $REPO" >&2
  local release_json
  release_json="$(curl -fsSL "$api_url")"

  local urls=()
  mapfile -t urls < <(printf '%s' "$release_json" \
    | grep -Eo "\"browser_download_url\": *\"[^\"]*${suffix}\"" \
    | sed -E 's/.*"(https:[^"]+)"/\1/' \
    | grep -Ev 'debuginfo|debugsource')

  if [ "${#urls[@]}" -eq 0 ]; then
    echo "Erro: nenhum asset '*${suffix}' encontrado na release '$release_tag'." >&2
    echo "Confira se o workflow de release já rodou para essa tag:" >&2
    echo "  https://github.com/$REPO/releases" >&2
    exit 1
  fi

  for url in "${urls[@]}"; do
    echo "==> Baixando $(basename "$url")" >&2
    curl -fsSL "$url" -o "$workdir/$(basename "$url")"
  done
}

# skip_gtk_package_if_cli_only remove do $workdir o pacote da interface GTK
# (vega-gtk) quando VEGA_CLI_ONLY=1 — feito depois do download e antes de
# instalar, pra o zypper não puxar gtk4/libadwaita como dependência dela num
# servidor headless.
skip_gtk_package_if_cli_only() {
  [ "$VEGA_CLI_ONLY" = "1" ] || return 0
  echo "==> VEGA_CLI_ONLY=1: pulando a interface GTK (vega-gtk)" >&2
  rm -f "$workdir"/vega-gtk-*
}

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

case "$distro_id $distro_id_like" in
  *opensuse*|*suse*)
    if ! command -v zypper >/dev/null 2>&1; then
      echo "Erro: 'zypper' não encontrado — isso não parece ser openSUSE." >&2
      exit 1
    fi

    download_release_assets '\.rpm'
    skip_gtk_package_if_cli_only

    echo "==> Instalando via zypper"
    echo "Aviso: os RPMs desta release ainda não são assinados (sem chave GPG"
    echo "configurada), então a instalação usa --allow-unsigned-rpm."
    zypper --non-interactive install -y --allow-unsigned-rpm "$workdir"/*.rpm
    ;;
  *)
    echo "Distro não reconhecida (ID=$distro_id, ID_LIKE=$distro_id_like)." >&2
    echo "Este instalador cobre só openSUSE Leap." >&2
    exit 1
    ;;
esac

if [ "$VEGA_CLI_ONLY" = "1" ]; then
  cat <<EOF

Instalação concluída.
- Daemon: vegad, ativado sob demanda via D-Bus (org.lyraos.Vega1)
- Interface: /usr/bin/vega (terminal, dialog)

Empacotamento ainda é considerado de teste — reporte problemas em
https://github.com/britors/Vega/issues.
EOF
else
  cat <<EOF

Instalação concluída.
- Daemon: vegad, ativado sob demanda via D-Bus (org.lyraos.Vega1)
- Interface gráfica: /usr/bin/vega-gtk
- Interface de terminal: /usr/bin/vega (rode via SSH, sem precisar do ambiente gráfico)

Empacotamento ainda é considerado de teste — reporte problemas em
https://github.com/britors/Vega/issues.
EOF
fi
