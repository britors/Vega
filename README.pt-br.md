# Lyra Vega - Enterprise Control Center

*[Read in English](README.md)*

Lyra Vega é um centro de controle nativo para Linux: reúne administração de
software, hardware, kernel, rede, backups, usuários e serviços numa única
interface integrada ao GNOME, no lugar de espalhar essas tarefas entre
`nmcli`, `systemctl`, editores de arquivo de configuração e um punhado de
ferramentas gráficas desencontradas. A proposta não é substituir as
Configurações do GNOME, e sim cobrir a faixa de administração de sistema que
elas deixam de fora — pacotes, kernel, snapshots, firewall, usuários — com a
mesma qualidade de integração visual.

O projeto é dividido em três partes. O `vegad`, um daemon separado (Go),
roda como root e pede sua senha via polkit — o mesmo mecanismo de
autorização usado pelas Configurações do GNOME — sempre que uma ação
realmente precisa mexer no sistema: trocar driver, instalar pacote, alterar
rede. As duas interfaces conversam com o `vegad` pelo mesmo contrato D-Bus
bem definido. Em cima desse backend compartilhado existem duas interfaces,
pra dois contextos diferentes: o `vega-gtk` (Rust + GTK4/libadwaita),
interface gráfica que roda com o seu usuário normal, sem privilégios; e o
`vega-cli` (bash + `dialog`), interface de terminal pra administrar um
servidor via SSH sem ambiente gráfico nenhum. Ao abrir o Vega CLI pelo ícone
do menu, o lançador usa `pkexec` e solicita a senha administrativa via polkit.

Licenciado sob GPL-3.0. Código em [github.com/britors/Vega](https://github.com/britors/Vega).

## Recursos

- painel com saúde do sistema e atalhos;
- software nativo, Flatpak e AUR, com atualizações e repositórios;
- snapshots opcionais via Snapper ou Timeshift e backups via Restic;
- hardware, drivers, kernel, bootloader, armazenamento, data e hora;
- Wi-Fi, Bluetooth, firewall, VPN, proxy e IPv4;
- usuários, serviços, logs e assistente com múltiplos provedores de IA.

Wallpapers, monitores e monitor de processos ficam fora do escopo: as
ferramentas nativas do desktop já atendem melhor a esses casos.

## Instalação

Mesmo instalador de conveniência para Arch, openSUSE Leap, Fedora e
Ubuntu/Debian — ele detecta a distro automaticamente e baixa o pacote certo
da release mais recente:

```sh
curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
```

Para travar numa versão específica: `VEGA_VERSION=v1.3.4 sudo -E bash install.sh`
(baixe o script primeiro se for usar essa variante).

Num servidor headless administrado só por SSH, dá pra pular a interface
gráfica (e a dependência de GTK4/libadwaita) e instalar só `vegad` +
`vega-cli`: `VEGA_CLI_ONLY=1 sudo -E bash install.sh` (ou
`sudo -E bash install.sh` já com o script baixado antes).

Depois da instalação, o Vega CLI pode ser aberto pelo ícone do menu — que
executa `/usr/bin/vega` via `pkexec` — ou diretamente em um terminal com
`sudo vega`.

Nenhuma das quatro distribuições está em repositório oficial ainda (nem AUR,
nem OBS, nem Copr, nem PPA) e os pacotes ainda não são assinados — operações
privilegiadas devem ser validadas com cuidado antes de cada release.

## O que já funciona

A interface gráfica cobre Painel, Software, Pontos de Restauração, Backup,
Hardware, Kernel, Armazenamento, Data e Hora, Rede/Firewall, Wi-Fi,
Bluetooth, Usuários, Serviços, Logs, Assistente e Sobre. Recursos que
dependem de uma ferramenta não instalada (Snapper, firewalld, etc.)
aparecem como indisponíveis em vez de travar a tela.

O `vega-cli`, a interface de terminal, cobre a mesma faixa funcional menos
o que não faz sentido num servidor headless: Painel, Software, Backup e
Pontos de Restauração, Hardware e Kernel, Usuários, Rede e Firewall,
Serviços, Data/Hora/Idioma, Armazenamento, Log do Sistema e Monitor do
Sistema (só valores, sem gráficos). Wi-Fi, Bluetooth, o Assistente de IA e
Tela são conceitos de sessão gráfica e ficam de fora dessa interface de
propósito.

## Distribuições testadas

Além das quatro com instalador automático (Arch, Fedora, openSUSE Leap e
Debian/Ubuntu, descritas em [Instalação](#instalação)), o Vega foi testado
manualmente em:

- Fedora Workstation 44, Fedora KDE 44
- openSUSE Leap 16, openSUSE Tumbleweed
- Debian 13, Ubuntu 26.04
- MX Linux 25.2, Linux Mint 22.3, LMDE 7, Zorin OS 18.1, Pop!_OS 24.04,
  deepin 25 (derivados Debian/Ubuntu)
- Rocky Linux 10, AlmaLinux 10 (derivados RHEL)
- Arch Linux, CachyOS, EndeavourOS (derivados Arch)

## Limitações conhecidas

- Software usa os gerenciadores da distribuição e Flatpak por subprocesso;
  o progresso é por etapa, não por bytes transferidos.
- AUR (como origem de instalação dentro do módulo Software) exige `yay` ou
  `paru`, executa builds com o usuário isolado `vega-build` e sempre mostra
  o PKGBUILD antes da confirmação.
- Snapper e Timeshift são opcionais. Sem uma dessas ferramentas, Pontos de
  Restauração aparece como indisponível; recursos avançados de diff e retenção
  continuam específicos do Snapper.
- O driver NVIDIA no Fedora depende do RPM Fusion nonfree já configurado; o
  Vega não habilita repositórios de terceiros automaticamente.
- O backend Debian/Ubuntu ainda não administra PPAs por
  `add-apt-repository`. O firewall usa UFW quando firewalld não está presente.

## Contribuindo

Quer rodar o projeto localmente, entender a arquitetura ou abrir um PR? Veja
[`CONTRIBUTING.md`](CONTRIBUTING.md).
