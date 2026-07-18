# Empacotamento para Fedora. Ainda não publicado em
# nenhum repositório oficial (Copr ou similar) — mesmo padrão de
# packaging/opensuse/vegad.spec, adaptado para DNF/nomes de pacote do Fedora.
#
# %%{version} é passado pela release/CI via `rpmbuild --define "version X.Y.Z"`
# (a tag `vX.Y.Z` sem o "v"). Buildar sem essa define usa o default abaixo.
%{!?version: %define version 0.0.0}

# Fedora's rpmbuild (unlike openSUSE's) errors out generating the automatic
# -debugsource subpackage for this binary: `find-debuginfo`/dwz can't produce
# a source-file list for a stripped Go binary shipping its own compressed
# DWARF (same underlying Go-vs-DWARF-tooling mismatch that made the .deb
# build skip dh_dwz, see packaging/debian-src/debian/rules), so
# debugsourcefiles.list ends up empty and rpm treats that as a fatal error.
# Disabling debuginfo package generation entirely sidesteps it — standard
# fix for Go/Rust binaries in Fedora spec files that don't follow the full
# Fedora Go packaging macros.
%global debug_package %{nil}

Name:           vegad
Version:        %{version}
Release:        1%{?dist}
Summary:        Daemon privilegiado do Vega, centro de controle para Linux
License:        GPL-3.0-only
URL:            https://github.com/britors/Vega
Source0:        vega-src.tar.gz

BuildRequires:  golang
BuildRequires:  checkpolicy
BuildRequires:  policycoreutils
Requires:       systemd
Requires:       dbus
Requires:       polkit
Requires(post):   systemd
Requires(preun):  systemd
Requires(postun): systemd

Recommends:     flatpak
Recommends:     NetworkManager
Recommends:     restic
Recommends:     firewalld
Recommends:     fwupd
Recommends:     bluez
Recommends:     logrotate

%description
Daemon privilegiado do Vega para Fedora. Expõe operações de sistema
(pacotes via DNF, snapshots via snapper quando disponível, kernel,
hardware, rede, firewall, usuários) via D-Bus, autorizadas por polkit.
Ativado sob demanda pelo D-Bus (Type=dbus), não roda como serviço
permanente.

%prep
%setup -q -c -n vega-src

%build
cd vegad
go build -trimpath -ldflags "-X github.com/lyraos/vegad/internal/version.Version=%{version}" \
  -o vegad ./cmd/vegad

# Módulo SELinux da issue #118: init_t (domínio do vegad, ainda sem
# domínio dedicado) não tem permissão de escrita em bootloader_etc_t na
# política padrão, então Kernel.ApplyBootConfig falhava com "permission
# denied" em /etc/default/grub. Regra mínima (init_t + bootloader_etc_t +
# write), carregada condicionalmente em %post — ver o comentário no
# próprio .te para o porquê de não ser um domínio dedicado.
cd ..
checkmodule -M -m -o packaging/vegad/selinux/vegad_bootloader.mod \
  packaging/vegad/selinux/vegad_bootloader.te
semodule_package -o packaging/vegad/selinux/vegad_bootloader.pp \
  -m packaging/vegad/selinux/vegad_bootloader.mod

%install
install -Dm755 vegad/vegad %{buildroot}%{_prefix}/lib/vega/vegad
install -Dm644 packaging/vegad/vegad.service \
  %{buildroot}%{_prefix}/lib/systemd/system/vegad.service
install -Dm644 packaging/vegad/vegad-update-check.service \
  %{buildroot}%{_prefix}/lib/systemd/system/vegad-update-check.service
install -Dm644 packaging/vegad/vegad-update-check.timer \
  %{buildroot}%{_prefix}/lib/systemd/system/vegad-update-check.timer
install -Dm644 packaging/vegad/org.lyraos.Vega1.conf \
  %{buildroot}%{_datadir}/dbus-1/system.d/org.lyraos.Vega1.conf
install -Dm644 packaging/vegad/org.lyraos.Vega1.service \
  %{buildroot}%{_datadir}/dbus-1/system-services/org.lyraos.Vega1.service
install -Dm644 packaging/vegad/org.lyraos.vega.policy \
  %{buildroot}%{_datadir}/polkit-1/actions/org.lyraos.vega.policy

# Exportação periódica do journal do vegad para /var/log/vega/vegad.log —
# journalctl continua sendo a fonte de verdade (o módulo Log do Sistema do
# vega-cli lê o journal direto), isso só mantém uma cópia persistente em
# arquivo, com rotação via logrotate.
install -Dm644 packaging/vegad/tmpfiles.d/vega-log.conf \
  %{buildroot}%{_prefix}/lib/tmpfiles.d/vega-log.conf
install -Dm644 packaging/vegad/vegad-log-export.service \
  %{buildroot}%{_prefix}/lib/systemd/system/vegad-log-export.service
install -Dm644 packaging/vegad/vegad-log-export.timer \
  %{buildroot}%{_prefix}/lib/systemd/system/vegad-log-export.timer
install -Dm644 packaging/vegad/logrotate.d/vegad \
  %{buildroot}%{_sysconfdir}/logrotate.d/vegad

install -Dm644 packaging/vegad/selinux/vegad_bootloader.pp \
  %{buildroot}%{_datadir}/selinux/packages/vegad_bootloader.pp

%files
%{_prefix}/lib/vega/vegad
%{_prefix}/lib/systemd/system/vegad.service
%{_prefix}/lib/systemd/system/vegad-update-check.service
%{_prefix}/lib/systemd/system/vegad-update-check.timer
%{_prefix}/lib/systemd/system/vegad-log-export.service
%{_prefix}/lib/systemd/system/vegad-log-export.timer
%{_prefix}/lib/tmpfiles.d/vega-log.conf
%config(noreplace) %{_sysconfdir}/logrotate.d/vegad
%{_datadir}/dbus-1/system.d/org.lyraos.Vega1.conf
%{_datadir}/dbus-1/system-services/org.lyraos.Vega1.service
%{_datadir}/polkit-1/actions/org.lyraos.vega.policy
%{_datadir}/selinux/packages/vegad_bootloader.pp

# vegad.service não tem [Install] (bus-activated, não systemctl enable) —
# só as timers de update-check e log-export são habilitadas aqui, mesma
# lógica de packaging/vegad/vegad.install e do vegad.spec do openSUSE.
#
# O módulo SELinux só é carregado se o sistema tiver SELinux habilitado
# (selinuxenabled) — em modo permissive/disabled ou sem as ferramentas
# instaladas, isso é pulado sem erro.
%post
systemd-tmpfiles --create %{_prefix}/lib/tmpfiles.d/vega-log.conf 2>/dev/null || true
systemctl daemon-reload
systemctl reload dbus.service 2>/dev/null || true
systemctl enable --now vegad-update-check.timer 2>/dev/null || true
systemctl enable --now vegad-log-export.timer 2>/dev/null || true
if command -v semodule >/dev/null 2>&1 && command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled 2>/dev/null; then
  semodule -i %{_datadir}/selinux/packages/vegad_bootloader.pp 2>/dev/null || true
fi

%preun
if [ "$1" = "0" ]; then
  systemctl disable --now vegad-update-check.timer 2>/dev/null || true
  systemctl disable --now vegad-log-export.timer 2>/dev/null || true
fi

%postun
systemctl daemon-reload
systemctl reload dbus.service 2>/dev/null || true
if [ "$1" = "0" ] && command -v semodule >/dev/null 2>&1; then
  semodule -r vegad_bootloader 2>/dev/null || true
fi

%changelog
