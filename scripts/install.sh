#!/usr/bin/env bash
# Instalador de conveniência: baixa os pacotes pré-compilados da release mais
# recente do Vega e instala com o gerenciador de pacotes da distro. Cobre
# openSUSE Leap (RPM, via .github/workflows/release-opensuse.yml), Fedora
# (RPM, via .github/workflows/release-fedora.yml) e Ubuntu/Debian (.deb, via
# .github/workflows/release-debian.yml). Em Arch use o pacote no AUR
# (`yay -S lyra-vega-gtk`), que já existe e é o caminho recomendado — não há
# RPM/.deb equivalente pra Arch.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
#
# VEGA_UI=qt sudo -E bash install.sh             # sobrescreve auto: gtk, qt ou both
# VEGA_VERSION=v1.3.4 sudo -E bash install.sh    # trava numa tag específica
set -euo pipefail

REPO="britors/Vega"
VEGA_UI="${VEGA_UI:-auto}"

case "$VEGA_UI" in
  auto|gtk|qt|both) ;;
  *) echo "VEGA_UI deve ser 'auto', 'gtk', 'qt' ou 'both'." >&2; exit 2 ;;
esac

detect_desktop_ui() {
  local desktop="${XDG_CURRENT_DESKTOP:-} ${XDG_SESSION_DESKTOP:-} ${DESKTOP_SESSION:-}"
  if [[ "$desktop" =~ [Kk][Dd][Ee]|[Pp][Ll][Aa][Ss][Mm][Aa] ]] ||
     [ "${KDE_FULL_SESSION:-}" = "true" ]; then
    printf '%s\n' qt
    return
  fi
  # A sessão atual é mais autoritativa que sessões paralelas do logind.
  if [ -n "${desktop//[[:space:]]/}" ]; then
    printf '%s\n' gtk
    return
  fi

  if command -v loginctl >/dev/null 2>&1; then
    local session session_desktop
    while read -r session _; do
      [ -n "$session" ] || continue
      session_desktop="$(loginctl show-session "$session" -p Desktop --value 2>/dev/null || true)"
      if [[ "$session_desktop" =~ [Kk][Dd][Ee]|[Pp][Ll][Aa][Ss][Mm][Aa] ]]; then
        printf '%s\n' qt
        return
      fi
    done < <(loginctl list-sessions --no-legend 2>/dev/null || true)
  fi

  if command -v pgrep >/dev/null 2>&1 && pgrep -x plasmashell >/dev/null 2>&1; then
    printf '%s\n' qt
    return
  fi

  printf '%s\n' gtk
}

if [ "$VEGA_UI" = auto ]; then
  VEGA_UI="$(detect_desktop_ui)"
  echo "==> Interface detectada para a sessão: $VEGA_UI" >&2
fi

if [ "${1:-}" = "--detect-ui" ]; then
  printf '%s\n' "$VEGA_UI"
  exit 0
fi

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

filter_ui_assets() {
  local file base
  for file in "$workdir"/*; do
    [ -e "$file" ] || continue
    base="$(basename "$file")"
    case "$VEGA_UI:$base" in
      gtk:lyra-vega-qt-*|gtk:lyra-vega-qt_*|qt:lyra-vega-gtk-*|qt:lyra-vega-gtk_*)
        rm -f "$file"
        ;;
    esac
  done
}

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

case "$distro_id $distro_id_like" in
  *arch*)
    cat >&2 <<'EOF'
Detectei Arch. Este instalador só empacota RPM/.deb pra openSUSE/Fedora/
Ubuntu; em Arch use o pacote do AUR, que já é o caminho suportado:

EOF
    if [ "$VEGA_UI" = both ]; then
      echo "  yay -S lyra-vega-gtk lyra-vega-qt"
    else
      echo "  yay -S lyra-vega-$VEGA_UI"
    fi
    cat >&2 <<'EOF'

(ou `paru -S lyra-vega-gtk`, se preferir).
EOF
    exit 1
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
    # nome do arquivo termina em "-1.x86_64.rpm"), enquanto os de
    # packaging/fedora/*.spec definem "dist .fcNN" (terminam em
    # "-1.fcNN.x86_64.rpm") — usa isso pra distinguir os dois conjuntos.
    download_release_assets '-1\.x86_64\.rpm'
    filter_ui_assets

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

    download_release_assets '-1\.fc[0-9]+\.x86_64\.rpm'
    filter_ui_assets

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
    filter_ui_assets

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

cat <<EOF

Instalação concluída.
- Daemon: vegad, ativado sob demanda via D-Bus (org.lyraos.Vega1)
- Interface instalada: $VEGA_UI
- GTK: /usr/bin/lyra-vega-gtk; Qt: /usr/bin/lyra-vega-qt

Empacotamento ainda é considerado de teste — reporte problemas em
https://github.com/britors/Vega/issues.
EOF
