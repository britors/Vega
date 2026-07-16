# Vega

Centro de controle nativo para Linux, construído com Rust, GTK4 e libadwaita.
O Vega reúne administração de software, hardware, kernel, rede, backups,
usuários e serviços em uma interface integrada ao GNOME. Operações
privilegiadas passam pelo daemon `vegad` (Go), via D-Bus e polkit.

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

### Arch

Publicado no AUR:

```sh
yay -S lyra-vega-gtk
```

### openSUSE Leap, Fedora e Ubuntu/Debian

Nenhuma está nos repositórios oficiais ainda (nem OBS, nem Copr, nem PPA). O
mesmo instalador de conveniência serve as três — ele detecta a distro via
`/etc/os-release` e baixa o pacote certo (`.rpm` ou `.deb`) da release mais
recente:

```sh
curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
```

Em openSUSE isso baixa `vegad-*.rpm`/`lyra-vega-gtk-*.rpm` (gerados por
[`.github/workflows/release-opensuse.yml`](.github/workflows/release-opensuse.yml)
a partir de [`packaging/opensuse/`](packaging/opensuse/)) e instala via
`zypper --allow-unsigned-rpm`. Em Fedora baixa
`vegad-*.fcNN.*.rpm`/`lyra-vega-gtk-*.fcNN.*.rpm`
(gerados por [`.github/workflows/release-fedora.yml`](.github/workflows/release-fedora.yml)
a partir de [`packaging/fedora/`](packaging/fedora/)) e instala via
`dnf install --nogpgcheck` (nenhum dos dois conjuntos de RPM é assinado ainda).
Em Ubuntu/Debian baixa `lyra-vega-gtk_*.deb`/`vegad_*.deb` (gerados por
[`.github/workflows/release-debian.yml`](.github/workflows/release-debian.yml)
a partir de [`packaging/debian-src/`](packaging/debian-src/)) e instala via
`apt-get install` (assim as dependências declaradas em `debian/control` são
resolvidas normalmente, ao contrário de `dpkg -i`). Em Arch o script só aponta
pro AUR — não há RPM/`.deb` equivalente lá.

Para travar numa versão específica: `VEGA_VERSION=v1.3.4 sudo -E bash install.sh`
(baixe o script primeiro se for usar essa variante).

Os pacotes ainda não estão assinados. A automação compila cada formato em sua
distribuição de destino, mas operações privilegiadas devem ser validadas em VM
antes de cada release. Para instalar a partir do checkout local, veja
[`packaging/opensuse/install.sh`](packaging/opensuse/install.sh) (openSUSE,
documentado também em [`CONTRIBUTING.md`](CONTRIBUTING.md) e
[`dependencias.md`](dependencias.md)), `rpmbuild -bb packaging/fedora/*.spec`
(Fedora, ver [`dependencias.md`](dependencias.md)) ou o comentário no topo de
[`packaging/debian-src/debian/rules`](packaging/debian-src/debian/rules)
(Ubuntu/Debian, precisa copiar `debian/` pra raiz do repo antes de rodar
`dpkg-buildpackage`, exigência do próprio `dpkg`).

## Layout do repositório

```
vega-gtk/    UI oficial (Rust + GTK4/libadwaita), roda como usuário comum
vega/        UI Electron anterior, mantida temporariamente como referência histórica
vegad/       Daemon privilegiado (Go), roda como root, exposto via D-Bus
dbus/        Definições de interface D-Bus (XML de introspecção) — contrato entre vega e vegad
packaging/   Unit systemd, policy polkit, conf D-Bus system.d, sysusers.d, PKGBUILDs (Arch), specs RPM (openSUSE, Fedora) e debian/rules (Ubuntu/Debian)
```

A arquitetura da migração da interface para Rust + GTK4 está em
[`docs/migration/rust-gtk-architecture.md`](docs/migration/rust-gtk-architecture.md),
com a [matriz de paridade](docs/migration/rust-gtk-parity.md) e o
[protocolo de baseline](docs/migration/rust-gtk-baseline.md) e o
[roteiro de QA](docs/migration/rust-gtk-qa.md). O cutover para GTK4 foi feito;
os pacotes finais não incluem Electron, Node ou npm.

## Status

A UI GTK cobre Painel, Software, Pontos de Restauração, Backup, Hardware,
Kernel, Armazenamento, Data e Hora, Rede/Firewall, Wi-Fi, Bluetooth, Usuários,
Serviços, Logs, Assistente e Sobre. O backend seleciona implementações por
distribuição e apresenta recursos opcionais como indisponíveis quando a
ferramenta correspondente não está instalada.

## Desenvolvimento

### lyra-vega-gtk (UI)

```
cd vega-gtk
cargo run
```

### vegad (daemon)

Requer Go instalado:

```
cd vegad
go mod tidy
go build ./...
```

Os PKGBUILDs em `packaging/vega` e `packaging/vegad` empacotam este checkout
local por padrão. Para gerar os dois pacotes em ordem (`vegad` e depois
`lyra-vega-gtk`):

```
./scripts/build-local-packages.sh
```

Para copiar os `.pkg.tar.zst` gerados para o repositório local usado pelo
perfil `lyra-iso`, informe o diretório como argumento ou via `LYRA_REPO_DIR`:

```
./scripts/build-local-packages.sh ~/.local/share/lyra-repo
```

Depois atualize o banco do repositório local no ambiente de build:

```
repo-add ~/.local/share/lyra-repo/lyra.db.tar.gz ~/.local/share/lyra-repo/*.pkg.tar.zst
```

Para publicar no AUR, siga o checklist em
[`docs/release/aur-publish.md`](docs/release/aur-publish.md).

## Validação

O roteiro reproduzível de smoke test está em
[`docs/validation/vega-end-to-end.md`](docs/validation/vega-end-to-end.md).
Para rodar os checks automatizados deste checkout, use:

```
./scripts/qa-smoke.sh
```

Para coletar dez amostras de inicialização, PSS, CPU e tamanho do binário:

```sh
./scripts/benchmark-ui.sh 10
```

Os resultados e o checklist manual de Wayland, X11 e acessibilidade ficam em
[`docs/migration/rust-gtk-qa.md`](docs/migration/rust-gtk-qa.md).

## Nomes D-Bus e polkit

- Bus name: `org.lyraos.Vega1` (system bus)
- Contrato de interfaces (introspecção XML): `dbus/org.lyraos.Vega1.*.xml` — fonte de verdade, mantida em sincronia com `vegad/internal/dbusserver/*.go`
- Actions polkit em `packaging/vegad/org.lyraos.vega.policy`, prefixo `org.lyraos.vega.*`
- `vegad` roda em `/usr/lib/vega/vegad`, unit bus-activated em `packaging/vegad/vegad.service`

## Limitações conhecidas

- Software usa os gerenciadores da distribuição e Flatpak por subprocesso;
  o progresso é por etapa, não por bytes transferidos.
- AUR exige `yay` ou `paru`, executa builds com o usuário isolado `vega-build`
  e sempre mostra o PKGBUILD antes da confirmação.
- Snapper e Timeshift são opcionais. Sem uma dessas ferramentas, Pontos de
  Restauração aparece como indisponível; recursos avançados de diff e retenção
  continuam específicos do Snapper.
- O driver NVIDIA no Fedora depende do RPM Fusion nonfree já configurado; o
  Vega não habilita repositórios de terceiros automaticamente.
- O backend Debian/Ubuntu ainda não administra PPAs por
  `add-apt-repository`. O firewall usa UFW quando firewalld não está presente.
- Os testes automatizados cobrem modelos, mocks D-Bus, daemon, lint e build.
  Operações polkit, acessibilidade, X11 e os quatro pacotes ainda fazem parte
  do roteiro manual de release.
