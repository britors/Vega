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
servidor via SSH sem ambiente gráfico nenhum. O Vega CLI não tem lançador
no menu de aplicativos — só roda pelo terminal, via `vega` — e sempre
precisa de privilégio de administrador: se iniciado sem, ele se
reexecuta via `sudo`, que pede a senha do usuário.

Licenciado sob GPL-3.0. Código em [github.com/britors/Vega](https://github.com/britors/Vega).

## Recursos

- painel com saúde do sistema e atalhos;
- software nativo (Zypper) e Flatpak, com atualizações e repositórios;
- snapshots opcionais via Snapper ou Timeshift e backups via Restic;
- hardware, drivers, kernel, bootloader, armazenamento, data e hora;
- Wi-Fi, Bluetooth, firewall, VPN, proxy e IPv4;
- usuários, serviços, logs e assistente com múltiplos provedores de IA;
- seletor de papel de parede, preferências de bloqueio de tela e monitor
  de sistema e processos em tempo real.

## Instalação

O Vega tem como alvo o openSUSE Leap. O jeito recomendado de instalar é
pelo openSUSE Build Service, em
[`home:rodrigosbrito:vega`](https://build.opensuse.org/project/show/home:rodrigosbrito:vega),
rebuilado automaticamente a partir deste repositório a cada release. Isso
mantém o repositório configurado pras próximas atualizações via `zypper
update`:

```sh
curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install-obs.sh | sudo bash
```

Num servidor headless administrado só por SSH, dá pra pular a interface
gráfica (e a dependência de GTK4/libadwaita) e instalar só `vegad` +
`vega-cli`: `VEGA_CLI_ONLY=1 sudo -E bash install-obs.sh` (ou
`sudo -E bash install-obs.sh` já com o script baixado antes).

Depois da instalação, abra o Vega CLI num terminal com `vega` — ele não tem
lançador no menu de aplicativos e se reexecuta via `sudo` caso ainda não
esteja rodando como root.

Alternativamente, `scripts/install.sh` baixa um RPM avulso direto da
release mais recente do GitHub em vez de configurar o repositório OBS —
útil pra travar numa versão específica (`VEGA_VERSION=v1.3.4 sudo -E bash
install.sh`), mas os RPMs baixados assim ainda não são assinados.

## Desinstalação

```sh
sudo bash scripts/uninstall.sh
```

Remove os pacotes `vega-gtk`, `vegad` e `vega-cli` (os que estiverem
instalados) via zypper. Com `VEGA_PURGE=1` também apaga estado que nenhum
pacote rastreia: configs/senhas do módulo Backup em `/etc/vega` e a
exportação do journal em `/var/log/vega`. Preferências por usuário do
assistente de IA na interface GTK
(`~/.local/share/vega-gtk/ai-settings.json`) não são tocadas — remova
manualmente se quiser.

## O que já funciona

A interface gráfica cobre Painel, Software, Pontos de Restauração, Backup,
Hardware, Kernel, Armazenamento, Data e Hora, Tela (Papel de Parede,
Bloqueio de Tela), Monitor do Sistema, Rede/Firewall, Wi-Fi, Bluetooth,
Usuários, Serviços, Logs, Assistente e Sobre. Recursos que
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

- openSUSE Leap 16, openSUSE Tumbleweed

## Limitações conhecidas

- Software usa Zypper e Flatpak por subprocesso; o progresso é por etapa,
  não por bytes transferidos.
- Snapper e Timeshift são opcionais. Sem uma dessas ferramentas, Pontos de
  Restauração aparece como indisponível; recursos avançados de diff e retenção
  continuam específicos do Snapper.

## Contribuindo

Quer rodar o projeto localmente, entender a arquitetura ou abrir um PR? Veja
[`CONTRIBUTING.md`](CONTRIBUTING.md).
