#!/usr/bin/env bash
# Instalador de conveniência: baixa os RPMs pré-compilados da release mais
# recente do Vega (publicados por .github/workflows/release-opensuse.yml) e
# instala via zypper. Só cobre openSUSE Leap por enquanto — em Arch
# use o pacote no AUR (`yay -S lyra-vega`), que já existe e é o caminho
# recomendado.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
#
# VEGA_VERSION=v1.3.4 sudo -E bash install.sh   # trava numa tag específica
set -euo pipefail

REPO="britors/Vega"

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

case "$distro_id $distro_id_like" in
  *arch*)
    cat >&2 <<'EOF'
Detectei Arch. Este instalador só empacota RPMs pra openSUSE Leap;
em Arch use o pacote do AUR, que já é o caminho suportado:

  yay -S lyra-vega

(ou `paru -S lyra-vega`, se preferir).
EOF
    exit 1
    ;;
  *opensuse*|*suse*)
    ;;
  *)
    echo "Distro não reconhecida (ID=$distro_id, ID_LIKE=$distro_id_like)." >&2
    echo "Este instalador só cobre openSUSE Leap por enquanto." >&2
    exit 1
    ;;
esac

if ! command -v zypper >/dev/null 2>&1; then
  echo "Erro: 'zypper' não encontrado — isso não parece ser openSUSE." >&2
  exit 1
fi

release_tag="${VEGA_VERSION:-latest}"
if [ "$release_tag" = "latest" ]; then
  api_url="https://api.github.com/repos/$REPO/releases/latest"
else
  api_url="https://api.github.com/repos/$REPO/releases/tags/$release_tag"
fi

echo "==> Consultando release ($release_tag) em $REPO"
release_json="$(curl -fsSL "$api_url")"

# Extrai as URLs de download dos assets .rpm "de verdade" (o build já exclui
# debuginfo/debugsource, mas o grep abaixo reforça isso caso mude).
mapfile -t rpm_urls < <(printf '%s' "$release_json" \
  | grep -o '"browser_download_url": *"[^"]*\.rpm"' \
  | sed -E 's/.*"(https:[^"]+)"/\1/' \
  | grep -Ev 'debuginfo|debugsource')

if [ "${#rpm_urls[@]}" -eq 0 ]; then
  echo "Erro: nenhum .rpm encontrado nos assets da release '$release_tag'." >&2
  echo "Confira se .github/workflows/release-opensuse.yml já rodou para essa tag:" >&2
  echo "  https://github.com/$REPO/releases" >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

for url in "${rpm_urls[@]}"; do
  echo "==> Baixando $(basename "$url")"
  curl -fsSL "$url" -o "$workdir/$(basename "$url")"
done

echo "==> Instalando via zypper"
echo "Aviso: os RPMs desta release ainda não são assinados (sem chave GPG"
echo "configurada), então a instalação usa --allow-unsigned-rpm."
zypper --non-interactive install -y --allow-unsigned-rpm "$workdir"/*.rpm

cat <<'EOF'

Instalação concluída.
- Daemon: vegad, ativado sob demanda via D-Bus (org.lyraos.Vega1)
- App: /usr/bin/vega (ou pelo atalho "Vega" no menu)

Empacotamento openSUSE ainda é considerado de teste — reporte problemas em
https://github.com/britors/Vega/issues.
EOF
