# Empacotamento para Fedora. Ver vegad.spec neste mesmo
# diretório para as notas gerais (versionamento via --define version,
# status do empacotamento e por que debug_package é desabilitado — mesmo
# problema aqui, agravado pelo Electron bundled trazendo seus próprios
# binários pré-compilados que find-debuginfo tentaria escanear).
%{!?version: %define version 0.0.0}
%global debug_package %{nil}
%global __requires_exclude_from ^%{_prefix}/lib/lyra-vega/node_modules/.*

Name:           vega
Version:        %{version}
Release:        1%{?dist}
Summary:        Centro de controle para Linux
License:        GPL-3.0-only
URL:            https://github.com/britors/Vega
Source0:        vega-src.tar.gz

BuildRequires:  nodejs
BuildRequires:  npm
Requires:       vegad

Recommends:     flatpak
Recommends:     restic

%description
UI do Vega (Electron/React) para Fedora. Não há pacote "electron" genérico
nos repositórios do Fedora, então o Electron da devDependency do npm é
empacotado junto em /usr/lib/lyra-vega/node_modules/electron — o pacote
fica maior que o normal por causa disso, mesma situação do empacotamento
openSUSE/Debian.

%prep
%setup -q -c -n vega-src

%build
cd vega
npm install --no-audit --no-fund
npm run build

%install
install -dm755 %{buildroot}%{_prefix}/lib/lyra-vega
cp -r vega/out/. %{buildroot}%{_prefix}/lib/lyra-vega/
rm -rf %{buildroot}%{_prefix}/lib/lyra-vega/node_modules
cp -r vega/node_modules %{buildroot}%{_prefix}/lib/lyra-vega/node_modules

install -Dm755 /dev/stdin %{buildroot}%{_bindir}/vega <<'WRAPPER'
#!/bin/sh
exec /usr/lib/lyra-vega/node_modules/electron/dist/electron /usr/lib/lyra-vega/main/index.js "$@"
WRAPPER

install -Dm644 packaging/vega/vega.desktop \
  %{buildroot}%{_datadir}/applications/vega.desktop
install -Dm644 packaging/vega/vega.svg \
  %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/vega.svg

%files
%{_prefix}/lib/lyra-vega
%{_bindir}/vega
%{_datadir}/applications/vega.desktop
%{_datadir}/icons/hicolor/scalable/apps/vega.svg

# Bundled Electron's chrome-sandbox helper needs to be 4755 root:root to
# work, but rpmbuild's %%files/permission handling doesn't ship arbitrary
# setuid bits by default — same underlying issue the Debian .deb hit (see
# packaging/debian-src/debian/vega.postinst), fixed the same way: re-apply
# the bit here at post-install time, when %%post runs as root.
%post
chmod 4755 %{_prefix}/lib/lyra-vega/node_modules/electron/dist/chrome-sandbox || true

%changelog
