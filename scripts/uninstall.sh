#!/usr/bin/env bash
# Desinstalador de conveniência: reverte scripts/install.sh removendo os
# pacotes do Vega (lyra-vega-gtk, vegad, vega-cli — o mesmo trio em todas
# as distros, ver packaging/{arch,debian-src,fedora,opensuse}/*) com o
# gerenciador de pacotes da distro. Os scriptlets de cada pacote (postrm/
# prerm no .deb, vegad.install no Arch, %preun/%postun nos .spec) já cuidam
# de parar/desabilitar units systemd e recarregar D-Bus — este script só
# decide qual gerenciador chamar e com quais pacotes.
#
# Uso:
#   sudo bash scripts/uninstall.sh
#
# VEGA_PURGE=1 sudo -E bash scripts/uninstall.sh   # além dos pacotes, remove
#                                                   # estado que nenhum dos
#                                                   # dois lados (pacote nem
#                                                   # scriptlet) apaga:
#                                                   # /etc/vega (configs/senhas
#                                                   # do módulo Backup),
#                                                   # /var/log/vega (export do
#                                                   # journal) e, só no Arch,
#                                                   # o usuário/diretório
#                                                   # vega-build usado para
#                                                   # builds AUR.
set -euo pipefail

VEGA_PURGE="${VEGA_PURGE:-0}"
PACKAGES=(lyra-vega-gtk vegad vega-cli)

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (sudo bash scripts/uninstall.sh)." >&2
  exit 1
fi

distro_id=""
distro_id_like=""
if [ -r /etc/os-release ]; then
  . /etc/os-release
  distro_id="${ID:-}"
  distro_id_like="${ID_LIKE:-}"
fi

# purge_leftover_state remove diretórios de estado que sobrevivem à remoção
# do pacote em qualquer distro: são criados em runtime pelo próprio vegad
# (/etc/vega/backup, ver vegad/internal/dbusserver/backup.go) ou por
# systemd-tmpfiles (/var/log/vega, packaging/vegad/tmpfiles.d/vega-log.conf)
# — nenhum gerenciador de pacotes rastreia esses caminhos como parte do
# pacote, então "remove"/"purge" do pacote nunca os apaga sozinho.
purge_leftover_state() {
  [ "$VEGA_PURGE" = "1" ] || return 0
  echo "==> VEGA_PURGE=1: removendo estado remanescente do Vega"

  # Cada config de backup gera sua própria vega-backup-<id>.{service,timer,path}
  # em /etc/systemd/system (vegad/internal/dbusserver/backup.go,
  # writeBackupSystemdUnits) — nada disso é arquivo de pacote, então some
  # antes de apagar /etc/vega/backup pra não deixar timer/path apontando
  # pra config que não existe mais.
  shopt -s nullglob
  backup_units=(/etc/systemd/system/vega-backup-*.{service,timer,path})
  shopt -u nullglob
  if [ "${#backup_units[@]}" -gt 0 ]; then
    echo "==> Desabilitando e removendo unidades de backup (vega-backup-*)"
    for unit in "${backup_units[@]}"; do
      systemctl disable --now "$(basename "$unit")" 2>/dev/null || true
      rm -f "$unit"
    done
  fi

  # /etc/vega/backup guarda config/senha do restic em texto (backup.go,
  # backupStateDirDefault) — sensível, sempre no purge. Respeita
  # VEGA_BACKUP_STATE_DIR se o admin tiver movido o diretório de estado.
  rm -rf "${VEGA_BACKUP_STATE_DIR:-/etc/vega/backup}"
  rmdir --ignore-fail-on-non-empty /etc/vega 2>/dev/null || true
  rm -rf /var/log/vega

  # vega-build (usuário + grupo + /var/lib/vega/build) só existe em builds
  # AUR/dev no Arch — packaging/vegad/sysusers.d/vega-build.conf e
  # tmpfiles.d/vega-build.conf, usados também por
  # scripts/dev-install-vegad.sh. pacman -Rns não desfaz sysusers, então
  # fica órfão depois da remoção do pacote se não for limpo aqui.
  if command -v userdel >/dev/null 2>&1 && id vega-build >/dev/null 2>&1; then
    echo "==> Removendo usuário/grupo vega-build e /var/lib/vega/build"
    userdel vega-build 2>/dev/null || true
    command -v groupdel >/dev/null 2>&1 && groupdel vega-build 2>/dev/null || true
    rm -rf /var/lib/vega/build
  fi
  rm -f /etc/sudoers.d/vega-build

  systemctl daemon-reload
}

case "$distro_id $distro_id_like" in
  *arch*)
    if ! command -v pacman >/dev/null 2>&1; then
      echo "Erro: 'pacman' não encontrado — isso não parece ser Arch." >&2
      exit 1
    fi

    installed=()
    for pkg in "${PACKAGES[@]}"; do
      pacman -Qi "$pkg" >/dev/null 2>&1 && installed+=("$pkg")
    done
    if [ "${#installed[@]}" -eq 0 ]; then
      echo "Nenhum pacote do Vega está instalado (pacman)."
    else
      echo "==> Removendo via pacman: ${installed[*]}"
      pacman -Rns --noconfirm "${installed[@]}"
    fi
    ;;
  *opensuse*|*suse*)
    if ! command -v zypper >/dev/null 2>&1; then
      echo "Erro: 'zypper' não encontrado — isso não parece ser openSUSE." >&2
      exit 1
    fi

    installed=()
    for pkg in "${PACKAGES[@]}"; do
      rpm -q "$pkg" >/dev/null 2>&1 && installed+=("$pkg")
    done
    if [ "${#installed[@]}" -eq 0 ]; then
      echo "Nenhum pacote do Vega está instalado (rpm/zypper)."
    else
      echo "==> Removendo via zypper: ${installed[*]}"
      zypper --non-interactive remove -y "${installed[@]}"
    fi
    ;;
  *fedora*)
    if ! command -v dnf >/dev/null 2>&1; then
      echo "Erro: 'dnf' não encontrado — isso não parece ser Fedora." >&2
      exit 1
    fi

    installed=()
    for pkg in "${PACKAGES[@]}"; do
      rpm -q "$pkg" >/dev/null 2>&1 && installed+=("$pkg")
    done
    if [ "${#installed[@]}" -eq 0 ]; then
      echo "Nenhum pacote do Vega está instalado (rpm/dnf)."
    else
      echo "==> Removendo via dnf: ${installed[*]}"
      dnf remove -y "${installed[@]}"
    fi
    ;;
  *debian*|*ubuntu*)
    if ! command -v apt-get >/dev/null 2>&1; then
      echo "Erro: 'apt-get' não encontrado — isso não parece ser Debian/Ubuntu." >&2
      exit 1
    fi

    installed=()
    for pkg in "${PACKAGES[@]}"; do
      dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q '^install ok installed$' && installed+=("$pkg")
    done
    if [ "${#installed[@]}" -eq 0 ]; then
      echo "Nenhum pacote do Vega está instalado (dpkg/apt)."
    else
      # purge (não remove) também apaga conffiles em /etc — sem isso,
      # /etc/logrotate.d/vegad sobreviveria à desinstalação.
      echo "==> Removendo via apt: ${installed[*]}"
      apt-get purge -y "${installed[@]}"
      apt-get autoremove -y
    fi
    ;;
  *)
    echo "Distro não reconhecida (ID=$distro_id, ID_LIKE=$distro_id_like)." >&2
    echo "Este desinstalador cobre openSUSE Leap, Fedora, Ubuntu/Debian e Arch." >&2
    exit 1
    ;;
esac

purge_leftover_state

cat <<EOF

Desinstalação concluída.
EOF

if [ "$VEGA_PURGE" != "1" ]; then
  cat <<EOF
Estado do Vega em /etc/vega e /var/log/vega (se existir) não foi removido —
rode de novo com VEGA_PURGE=1 se quiser apagar também esses diretórios (e,
no Arch, o usuário vega-build usado para builds AUR).
EOF
fi

cat <<EOF
Nota: dados por usuário em ~/.local/share/lyra-vega-gtk/ai-settings.json e
~/.local/share/lyra-vega-xfce/ai-settings.json (config do assistente de IA
da interface gráfica, possivelmente com chave de API, um diretório por
usuário que já usou o Vega) não são tocados por este script — remova
manualmente em cada \$HOME se quiser limpar também esses arquivos.
EOF
