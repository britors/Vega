#!/usr/bin/env bash
# Instalador de conveniência: baixa os pacotes pré-compilados da release mais
# recente do Vega e instala com o gerenciador de pacotes da distro. Cobre
# openSUSE Leap (RPM, via .github/workflows/release-opensuse.yml), Fedora
# (RPM, via .github/workflows/release-fedora.yml), Ubuntu/Debian (.deb, via
# .github/workflows/release-debian.yml) e Arch (.pkg.tar.zst, via
# .github/workflows/release-arch.yml) — mesma release do GitHub pras 4.
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
# termina no sufixo passado (".rpm" ou ".deb"), usando a API de releases do
# GitHub — mesma lógica que já existia hardcoded pra RPM, só parametrizada
# pelo sufixo pra ser reaproveitada pelo caminho .deb também.
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

# skip_gtk_package_if_cli_only remove do $workdir o(s) pacote(s) da
# interface GTK (lyra-vega-gtk) quando VEGA_CLI_ONLY=1 — feito depois do
# download e antes de instalar, pra nenhum gerenciador de pacotes puxar
# gtk4/libadwaita como dependência dela num servidor headless. O nome do
# pacote vira prefixo do arquivo com "-" (Arch/RPM) ou "_" (Debian), daí os
# dois padrões de glob.
skip_gtk_package_if_cli_only() {
  [ "$VEGA_CLI_ONLY" = "1" ] || return 0
  echo "==> VEGA_CLI_ONLY=1: pulando a interface GTK (lyra-vega-gtk)" >&2
  rm -f "$workdir"/lyra-vega-gtk-* "$workdir"/lyra-vega-gtk_*
}

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

case "$distro_id $distro_id_like" in
  *arch*)
    if ! command -v pacman >/dev/null 2>&1; then
      echo "Erro: 'pacman' não encontrado — isso não parece ser Arch." >&2
      exit 1
    fi

    download_release_assets '\.pkg\.tar\.zst'
    skip_gtk_package_if_cli_only

    echo "==> Instalando via pacman"
    pacman -U --noconfirm "$workdir"/*.pkg.tar.zst
    ;;
  *opensuse*|*suse*)
    if ! command -v zypper >/dev/null 2>&1; then
      echo "Erro: 'zypper' não encontrado — isso não parece ser openSUSE." >&2
      exit 1
    fi

    # A mesma release do GitHub carrega tanto os RPMs do openSUSE quanto os
    # do Fedora agora (release-opensuse.yml e release-fedora.yml publicam no
    # mesmo tag) — um suffix genérico '\.rpm' pegaria os dois conjuntos.
    # Os specs de packaging/opensuse/*.spec não definem %dist (então o
    # nome do arquivo termina em "-1.x86_64.rpm" ou, pro vega-cli
    # noarch, "-1.noarch.rpm"), enquanto os de packaging/fedora/*.spec
    # definem "dist .fcNN" (terminam em "-1.fcNN.x86_64.rpm"/".fcNN.noarch.rpm")
    # — usa isso pra distinguir os dois conjuntos.
    download_release_assets '-1\.(x86_64|noarch)\.rpm'
    skip_gtk_package_if_cli_only

    echo "==> Instalando via zypper"
    echo "Aviso: os RPMs desta release ainda não são assinados (sem chave GPG"
    echo "configurada), então a instalação usa --allow-unsigned-rpm."
    zypper --non-interactive install -y --allow-unsigned-rpm "$workdir"/*.rpm
    ;;
  *fedora*)
    if ! command -v dnf >/dev/null 2>&1; then
      echo "Erro: 'dnf' não encontrado — isso não parece ser Fedora." >&2
      exit 1
    fi

    download_release_assets '-1\.fc[0-9]+\.(x86_64|noarch)\.rpm'
    skip_gtk_package_if_cli_only

    echo "==> Instalando via dnf"
    echo "Aviso: empacotamento Fedora ainda é considerado de teste, não"
    echo "validado ponta a ponta numa instalação real. Os RPMs também não"
    echo "são assinados (sem chave GPG configurada)."
    dnf install -y --nogpgcheck "$workdir"/*.rpm
    ;;
  *debian*|*ubuntu*)
    if ! command -v apt-get >/dev/null 2>&1; then
      echo "Erro: 'apt-get' não encontrado — isso não parece ser Debian/Ubuntu." >&2
      exit 1
    fi

    download_release_assets '\.deb'
    skip_gtk_package_if_cli_only

    echo "==> Instalando via apt"
    echo "Aviso: empacotamento Ubuntu/Debian ainda é considerado de teste,"
    echo "não validado ponta a ponta numa instalação real."
    apt-get update
    # apt (não dpkg -i) resolve as dependências declaradas em debian/control
    # (dbus, polkit etc.) a partir dos repositórios já configurados.
    apt-get install -y "$workdir"/*.deb
    ;;
  *)
    echo "Distro não reconhecida (ID=$distro_id, ID_LIKE=$distro_id_like)." >&2
    echo "Este instalador cobre openSUSE Leap, Fedora e Ubuntu/Debian por enquanto." >&2
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
- Interface gráfica: /usr/bin/lyra-vega-gtk
- Interface de terminal: /usr/bin/vega (rode via SSH, sem precisar do ambiente gráfico)

Empacotamento ainda é considerado de teste — reporte problemas em
https://github.com/britors/Vega/issues.
EOF
fi
