# Empacotamento de teste local/CI para openSUSE Leap. Ver vegad.spec neste
# mesmo diretório para as notas gerais (versionamento via --define version,
# status do empacotamento).
%{!?version: %define version 0.0.0}

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
UI do Vega (Electron/React) para openSUSE Leap. Não há binário "electron"
empacotado no Leap, então o Electron da devDependency do npm é empacotado
junto em /usr/lib/lyra-vega/node_modules/electron — o pacote fica maior que
o normal por causa disso.

Empacotamento ainda não validado ponta a ponta num Leap real — trate como
build de teste.

%prep
%setup -q -c -n vega-src

%build
cd vega
npm ci
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

%changelog
