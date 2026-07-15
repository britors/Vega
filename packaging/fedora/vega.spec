# Empacotamento para Fedora. Ver vegad.spec neste mesmo
# diretório para as notas gerais (versionamento via --define version,
# status do empacotamento).
%{!?version: %define version 0.0.0}

Name:           lyra-vega-gtk
Version:        %{version}
Release:        1%{?dist}
Summary:        Centro de controle para Linux
License:        GPL-3.0-only
URL:            https://github.com/britors/Vega
Source0:        vega-src.tar.gz

BuildRequires:  cargo
BuildRequires:  rust
BuildRequires:  pkgconfig(gtk4)
BuildRequires:  pkgconfig(libadwaita-1)
Requires:       vegad
Provides:       vega = %{version}-%{release}
Obsoletes:      vega < %{version}-%{release}

Recommends:     flatpak
Recommends:     restic

%description
Interface nativa do Vega, construída com Rust, GTK4 e libadwaita.

%prep
%setup -q -c -n vega-src

%build
cd vega-gtk
cargo build --release --locked

%install
install -Dm755 vega-gtk/target/release/lyra-vega-gtk \
  %{buildroot}%{_bindir}/lyra-vega-gtk
ln -s lyra-vega-gtk %{buildroot}%{_bindir}/vega

install -Dm644 packaging/vega/vega.desktop \
  %{buildroot}%{_datadir}/applications/vega.desktop
install -Dm644 packaging/vega/vega.svg \
  %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/vega.svg

%files
%{_bindir}/lyra-vega-gtk
%{_bindir}/vega
%{_datadir}/applications/vega.desktop
%{_datadir}/icons/hicolor/scalable/apps/vega.svg

%changelog
