# Dependências do sistema para o Vega

O `vegad` fala com o gerenciador de pacotes por trás de uma camada de abstração
(`vegad/internal/distro`) com um backend por distro: Pacman+AUR em Arch, Zypper
em openSUSE Leap, DNF em Fedora e APT em Debian/Ubuntu. As dependências abaixo
mudam de nome/forma de instalação conforme a distro, mas o papel de cada uma é
o mesmo.

## Arch

### Pacotes obrigatórios

Instalados automaticamente por `depends=()` ao rodar `yay -S vega-gtk`:

- `gtk4` e `libadwaita` — toolkit da interface nativa
- `vegad` — daemon privilegiado, que por sua vez exige:
  - `systemd`
  - `dbus`
  - `polkit`
  - `pacman`
  - `bluez`
  - `bluez-obex`

### Pacotes opcionais (um por módulo — sem eles o módulo correspondente reporta "indisponível", o resto do app funciona normalmente)

| Pacote | Módulo | Observação |
| --- | --- | --- |
| `snapper` | Snapshots | Precisa ter uma config chamada **`root`** (`snapper -c root ...`, nome fixo no código de `vegad`). Requer raiz em Btrfs. |
| `flatpak` | Software (origem Flathub) | — |
| `networkmanager` | Rede | — |
| `restic` | Backup | — |
| `firewalld` | Firewall | Precisa do **serviço ativo** (`systemctl enable --now firewalld`), não basta instalar. |
| `fwupd` | Hardware (firmware) | — |
| `yay` ou `paru` | Software (origem Comunidade/AUR) | Sem um dos dois, o módulo Software não lista/instala pacotes AUR. |
| `reflector` | Software (otimizar mirrors) | — |

### Resumo de instalação (Arch)

```sh
# obrigatório
yay -S vega-gtk

# opcionais (conforme os módulos desejados)
sudo pacman -S snapper flatpak networkmanager restic firewalld fwupd reflector
sudo systemctl enable --now firewalld
```

## openSUSE Leap

Os RPMs são publicados em cada GitHub Release e também podem ser compilados
localmente pelos specs em `packaging/opensuse/`. O backend Zypper/hardware NVIDIA
(`vegad/internal/distro/zypper.go`, `hardware_opensuse.go`) ainda não foi
validado ponta a ponta num Leap real — trate os nomes de pacote abaixo como
ponto de partida, não garantia.

### Necessários só para compilar (o script verifica e aborta se faltar)

- `go`, `rust`, `cargo` e `gcc`
- `pkg-config`, `gtk4-devel` e `libadwaita-devel`

### Base de sistema (já presente em qualquer Leap com systemd/D-Bus/polkit; nada equivalente a `pacman`/`bluez` é obrigatório)

- `systemd`
- `dbus-1`
- `polkit`
- Não há camada de comunidade equivalente à AUR em Leap — `distro.Provider.Community()` retorna `nil`, então o módulo Software não tem origem "Comunidade" nessa distro.

### Pacotes opcionais (mesmo papel da tabela do Arch — o script `install.sh` já avisa quais binários estão faltando)

| Pacote (zypper) | Binário verificado | Módulo |
| --- | --- | --- |
| `snapper` | `snapper` | Snapshots (config **`root`**, requer raiz em Btrfs) |
| `flatpak` | `flatpak` | Software (origem Flathub) |
| `NetworkManager` | `nmcli` | Rede |
| `restic` | `restic` | Backup |
| `firewalld` | `firewall-cmd` | Firewall (precisa do serviço ativo) |
| `fwupd` | `fwupdmgr` | Hardware (firmware) |
| `bluez` | `bluetoothctl` | Bluetooth |

### Resumo de instalação (openSUSE)

```sh
# dependências de build
sudo zypper install go rust cargo gcc pkg-config gtk4-devel libadwaita-devel

# opcionais (conforme os módulos desejados)
sudo zypper install snapper flatpak NetworkManager restic firewalld fwupd bluez
sudo systemctl enable --now firewalld

# instala a interface e o daemon a partir do checkout do repo
sudo packaging/opensuse/install.sh
```

## Fedora

Publicado como `.rpm` na GitHub Release de cada tag, via
[`.github/workflows/release-fedora.yml`](.github/workflows/release-fedora.yml)
e os specs em [`packaging/fedora/`](packaging/fedora/) (mesmo modelo do
openSUSE, adaptado pra DNF/nomes de pacote do Fedora). O backend DNF/hardware
NVIDIA (`vegad/internal/distro/{dnf,kernel_fedora,hardware_fedora}.go`) é
código novo, não validado ponta a ponta num Fedora real — mesmo aviso de
"ponto de partida, não garantia" que já vale pro backend openSUSE.

### Necessários só para compilar

- `golang`, `rust`, `cargo` e `gcc`
- `pkgconf-pkg-config`, `gtk4-devel` e `libadwaita-devel`

### Base de sistema (já presente em qualquer Fedora Workstation com systemd/D-Bus/polkit)

- `systemd`
- `dbus`
- `polkit`
- Não há camada de comunidade equivalente à AUR — `distro.Provider.Community()` retorna `nil`, então o módulo Software não tem origem "Comunidade" nessa distro (COPR fica fora do escopo atual).

### Pacotes opcionais (mesmo papel das tabelas acima)

| Pacote (dnf) | Binário verificado | Módulo | Observação |
| --- | --- | --- | --- |
| `flatpak` | `flatpak` | Software (origem Flathub) | Já vem pré-configurado no Fedora Workstation. |
| `NetworkManager` | `nmcli` | Rede | — |
| `restic` | `restic` | Backup | — |
| `firewalld` | `firewall-cmd` | Firewall | Já vem habilitado por padrão no Fedora Workstation. |
| `fwupd` | `fwupdmgr` | Hardware (firmware) | — |
| `bluez` | `bluetoothctl` | Bluetooth | — |
| `akmod-nvidia` (repo **RPM Fusion nonfree**, não vem no Fedora) | — | Hardware (driver NVIDIA) | Fedora não empacota o driver proprietário; precisa do RPM Fusion nonfree habilitado antes. O módulo de build do akmod roda em segundo plano (serviço `akmods`) — não é imediato após a instalação. |

### Resumo de instalação (Fedora)

```sh
# dependências de build
sudo dnf install golang rust cargo gcc pkgconf-pkg-config gtk4-devel libadwaita-devel

# opcionais (conforme os módulos desejados)
sudo dnf install flatpak NetworkManager restic firewalld fwupd bluez

# driver NVIDIA (requer RPM Fusion nonfree habilitado antes)
sudo dnf install akmod-nvidia

# instala via RPM da release (ver scripts/install.sh) ou local:
sudo rpmbuild -bb --define "version 2.0.3" packaging/fedora/vegad.spec
sudo rpmbuild -bb --define "version 2.0.3" packaging/fedora/vega.spec
```

## Ubuntu / Debian

Os pacotes `.deb` são publicados em cada GitHub Release; veja
[`packaging/debian-src/`](packaging/debian-src/) para o empacotamento local. O
backend APT/hardware NVIDIA (`vegad/internal/distro/{apt,kernel_debian,hardware_debian}.go`)
e o backend de Firewall (`vegad/internal/dbusserver/ufw.go`) são código novo,
não validados ponta a ponta num Ubuntu real — mesmo aviso de "ponto de
partida, não garantia" que já vale pro backend openSUSE. O módulo Snapshots
depende do snapper (veja abaixo) — sem ele, o menu "Pontos de Restauração"
fica oculto, já que o Timeshift deixou de ser um backend suportado
(issue #48: a saída do `timeshift --list` nunca bateu com uma instalação
real).

### Necessários só para compilar

- `golang-go`, `rustc`, `cargo` e `build-essential`
- `pkg-config`, `libgtk-4-dev` e `libadwaita-1-dev`

### Base de sistema

- `systemd`
- `dbus`
- `polkit`
- Não há camada de comunidade equivalente à AUR — `distro.Provider.Community()` retorna `nil`, então o módulo Software não tem origem "Comunidade" nessa distro (PPAs ficam fora do escopo atual).

### Pacotes opcionais (mesmo papel das tabelas acima)

| Pacote (apt) | Binário verificado | Módulo | Observação |
| --- | --- | --- | --- |
| `flatpak` | `flatpak` | Software (origem Flathub) | — |
| `network-manager` | `nmcli` | Rede | — |
| `restic` | `restic` | Backup | — |
| `ufw` | `ufw` | Firewall | Catálogo de perfis (`ufw app list`) depende de quais pacotes com profile (`openssh-server`, `samba`, `cups`) estão instalados. |
| `fwupd` | `fwupdmgr` | Hardware (firmware) | — |
| `bluez` | `bluetoothctl` | Bluetooth | — |
| `ubuntu-drivers-common` | `ubuntu-drivers` | Hardware (driver NVIDIA) | Sem ele, `AvailableNvidiaDrivers` só oferece a opção `nouveau`. |

### Resumo de instalação (Ubuntu/Debian)

```sh
# dependências de build
sudo apt install golang-go rustc cargo build-essential pkg-config libgtk-4-dev libadwaita-1-dev

# opcionais (conforme os módulos desejados)
sudo apt install flatpak network-manager restic ufw fwupd bluez ubuntu-drivers-common
sudo ufw enable
```

## Requisitos de sistema comuns a todas as distros

- **Barramento D-Bus system ativo** (`dbus-broker.service` ou `dbus.service`,
  a depender da distro). O `vegad` é ativado sob demanda pelo D-Bus
  (`Type=dbus`, `BusName=org.lyraos.Vega1`, sem `[Install]` — não se usa
  `systemctl enable`). Isso só funciona se o pacote instalar
  `/usr/share/dbus-1/system-services/org.lyraos.Vega1.service` com
  `SystemdService=vegad.service`; sem esse arquivo o barramento não sabe
  que precisa pedir ao systemd para subir o daemon.
- **polkit ativo** — autoriza as ações privilegiadas que o `vegad` expõe
  (`org.lyraos.vega.policy`).
- Sistema de arquivos raiz em **Btrfs** e `snapper` instalado, para o módulo
  de Snapshots (Arch/openSUSE por padrão) — sem snapper o menu "Pontos de
  Restauração" fica oculto em qualquer distro.
