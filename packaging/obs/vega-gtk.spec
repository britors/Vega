# Empacotamento para o openSUSE Build Service (home:rodrigosbrito:vega).
# Cópia de packaging/opensuse/vega.spec adaptada só no Source0/%setup pra
# bater com o tarball que o _service (tar_scm) deste mesmo diretório
# gera — nome com sufixo de versão e diretório interno próprio, ao invés
# do tar "achatado" (sem diretório-raiz) que .github/workflows/release-opensuse.yml
# monta com tar czf. Resto do spec é idêntico ao de packaging/opensuse/.
#
# Version literal (não %{version}/%define) — o serviço set_version deste
# diretório faz substituição textual simples na linha "Version:" e não
# entende macro, então precisa achar um valor literal aqui pra reescrever.
Name:           lyra-vega-gtk
Version:        0
Release:        1%{?dist}
Summary:        Centro de controle para Linux
License:        GPL-3.0-only
URL:            https://github.com/britors/Vega
Source0:        vega-src-%{version}.tar.gz

BuildRequires:  cargo
BuildRequires:  rust
BuildRequires:  pkgconfig(gtk4)
BuildRequires:  pkgconfig(libadwaita-1)
Requires:       vegad
Requires:       secret-tool
Provides:       vega = %{version}-%{release}
Obsoletes:      vega < %{version}-%{release}

Recommends:     flatpak
Recommends:     restic

%description
Interface nativa do Vega, construída com Rust, GTK4 e libadwaita.

%prep
%setup -q -n vega-src-%{version}

%build
cd vega-gtk
cargo build --release --locked

%install
install -Dm755 target/release/lyra-vega-gtk \
  %{buildroot}%{_bindir}/lyra-vega-gtk
ln -s lyra-vega-gtk %{buildroot}%{_bindir}/vega-gtk

install -Dm644 packaging/vega/vega.desktop \
  %{buildroot}%{_datadir}/applications/vega.desktop
install -Dm644 packaging/vega/vega.svg \
  %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/vega.svg

%files
%{_bindir}/lyra-vega-gtk
%{_bindir}/vega-gtk
%{_datadir}/applications/vega.desktop
%{_datadir}/icons/hicolor/scalable/apps/vega.svg

%changelog
