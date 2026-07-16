%{!?version: %define version 0.1.0}
Name:           lyra-vega-qt
Version:        %{version}
Release:        1%{?dist}
Summary:        Interface Qt do centro de controle Vega
License:        GPL-3.0-only
URL:            https://github.com/britors/Vega
Source0:        vega-src.tar.gz
BuildRequires:  cmake
BuildRequires:  ninja-build
BuildRequires:  cmake(Qt6Core)
BuildRequires:  cmake(Qt6DBus)
BuildRequires:  cmake(Qt6Network)
BuildRequires:  cmake(Qt6Widgets)
Requires:       vegad
Requires:       libsecret

%description
Interface Qt independente do Vega. Pode ser instalada junto da interface GTK.

%prep
%setup -q -c -n vega-src

%build
%cmake -S vega-qt -G Ninja -DBUILD_TESTING=OFF
%cmake_build

%install
%cmake_install

%files
%{_bindir}/lyra-vega-qt
%{_datadir}/applications/org.lyraos.VegaQt.desktop
%{_datadir}/metainfo/org.lyraos.VegaQt.metainfo.xml
%{_datadir}/icons/hicolor/scalable/apps/org.lyraos.VegaQt.svg

%changelog
