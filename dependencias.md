# Dependências do sistema para o Vega

## Pacotes obrigatórios

Instalados automaticamente por `depends=()` ao rodar `yay -S lyra-vega`:

- `electron31-bin` — runtime do Electron usado pela UI (`vega`)
- `vegad` — daemon privilegiado, que por sua vez exige:
  - `systemd`
  - `dbus`
  - `polkit`
  - `pacman`
  - `bluez`
  - `bluez-obex`

## Requisitos de sistema (além dos pacotes)

- **Barramento D-Bus system ativo** (`dbus-broker.service` ou `dbus.service`,
  a depender da distro). O `vegad` é ativado sob demanda pelo D-Bus
  (`Type=dbus`, `BusName=org.lyraos.Vega1`, sem `[Install]` — não se usa
  `systemctl enable`). Isso só funciona se o pacote instalar
  `/usr/share/dbus-1/system-services/org.lyraos.Vega1.service` com
  `SystemdService=vegad.service`; sem esse arquivo o barramento não sabe
  que precisa pedir ao systemd para subir o daemon.
- **polkit ativo** — autoriza as ações privilegiadas que o `vegad` expõe
  (`org.lyraos.vega.policy`).
- Sistema de arquivos raiz em **Btrfs**, se o módulo de Snapshots for usado
  (ver abaixo).

## Pacotes opcionais (um por módulo — sem eles o módulo correspondente reporta "indisponível", o resto do app funciona normalmente)

| Pacote | Módulo | Observação |
|---|---|---|
| `snapper` | Snapshots | Precisa ter uma config chamada **`root`** (`snapper -c root ...`, nome fixo no código de `vegad`). Requer raiz em Btrfs. |
| `flatpak` | Software (origem Flathub) | — |
| `networkmanager` | Rede | — |
| `restic` | Backup | — |
| `firewalld` | Firewall | Precisa do **serviço ativo** (`systemctl enable --now firewalld`), não basta instalar. |
| `fwupd` | Hardware (firmware) | — |

## Resumo de instalação

```sh
# obrigatório
yay -S lyra-vega

# opcionais (conforme os módulos desejados)
sudo pacman -S snapper flatpak networkmanager restic firewalld fwupd
sudo systemctl enable --now firewalld
```
