# Dependências do sistema para o Vega

O `vegad` fala com o gerenciador de pacotes por trás de uma camada de abstração
(`vegad/internal/distro`) com um backend por distro: Pacman+AUR em Arch e
Zypper em openSUSE Leap. As dependências abaixo mudam de nome/forma de instalação
conforme a distro, mas o papel de cada uma é o mesmo.

## Arch

### Pacotes obrigatórios

Instalados automaticamente por `depends=()` ao rodar `yay -S lyra-vega`:

- `electron31-bin` — runtime do Electron usado pela UI (`vega`)
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
yay -S lyra-vega

# opcionais (conforme os módulos desejados)
sudo pacman -S snapper flatpak networkmanager restic firewalld fwupd reflector
sudo systemctl enable --now firewalld
```

## openSUSE Leap

Ainda não existe pacote `.rpm`; a instalação é manual via
[`packaging/opensuse/install.sh`](packaging/opensuse/install.sh) (e
`uninstall.sh`), que compila `vega`/`vegad` a partir do repositório e instala
os arquivos de systemd/D-Bus/polkit. O backend Zypper/hardware NVIDIA
(`vegad/internal/distro/zypper.go`, `hardware_opensuse.go`) ainda não foi
validado ponta a ponta num Leap real — trate os nomes de pacote abaixo como
ponto de partida, não garantia.

### Necessários só para compilar (o script verifica e aborta se faltar)

- `go`
- `nodejs` / `npm`

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
sudo zypper install go nodejs npm

# opcionais (conforme os módulos desejados)
sudo zypper install snapper flatpak NetworkManager restic firewalld fwupd bluez
sudo systemctl enable --now firewalld

# instala vega/vegad a partir do checkout do repo
sudo packaging/opensuse/install.sh
```

## Requisitos de sistema comuns às duas distros

- **Barramento D-Bus system ativo** (`dbus-broker.service` ou `dbus.service`,
  a depender da distro). O `vegad` é ativado sob demanda pelo D-Bus
  (`Type=dbus`, `BusName=org.lyraos.Vega1`, sem `[Install]` — não se usa
  `systemctl enable`). Isso só funciona se o pacote instalar
  `/usr/share/dbus-1/system-services/org.lyraos.Vega1.service` com
  `SystemdService=vegad.service`; sem esse arquivo o barramento não sabe
  que precisa pedir ao systemd para subir o daemon.
- **polkit ativo** — autoriza as ações privilegiadas que o `vegad` expõe
  (`org.lyraos.vega.policy`).
- Sistema de arquivos raiz em **Btrfs**, se o módulo de Snapshots for usado.
