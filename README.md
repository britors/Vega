# Vega

Centro de controle unificado para Linux.

## Instalação

### Arch

Publicado no AUR:

```sh
yay -S lyra-vega
```

### openSUSE Leap, Fedora e Ubuntu/Debian

Nenhuma está nos repositórios oficiais ainda (nem OBS, nem Copr, nem PPA). O
mesmo instalador de conveniência serve as três — ele detecta a distro via
`/etc/os-release` e baixa o pacote certo (`.rpm` ou `.deb`) da release mais
recente:

```sh
curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
```

Em openSUSE isso baixa `vegad-*.rpm`/`vega-*.rpm` (gerados por
[`.github/workflows/release-opensuse.yml`](.github/workflows/release-opensuse.yml)
a partir de [`packaging/opensuse/`](packaging/opensuse/)) e instala via
`zypper --allow-unsigned-rpm`. Em Fedora baixa `vegad-*.fcNN.*.rpm`/`vega-*.fcNN.*.rpm`
(gerados por [`.github/workflows/release-fedora.yml`](.github/workflows/release-fedora.yml)
a partir de [`packaging/fedora/`](packaging/fedora/)) e instala via
`dnf install --nogpgcheck` (nenhum dos dois conjuntos de RPM é assinado ainda).
Em Ubuntu/Debian baixa `vega_*.deb`/`vegad_*.deb` (gerados por
[`.github/workflows/release-debian.yml`](.github/workflows/release-debian.yml)
a partir de [`packaging/debian-src/`](packaging/debian-src/)) e instala via
`apt-get install` (assim as dependências declaradas em `debian/control` são
resolvidas normalmente, ao contrário de `dpkg -i`). Em Arch o script só aponta
pro AUR — não há RPM/`.deb` equivalente lá.

Para travar numa versão específica: `VEGA_VERSION=v1.3.4 sudo -E bash install.sh`
(baixe o script primeiro se for usar essa variante).

Os três empacotamentos ainda são considerados de teste (ver avisos em
[`packaging/opensuse/vegad.spec`](packaging/opensuse/vegad.spec),
[`packaging/fedora/vegad.spec`](packaging/fedora/vegad.spec) e
[`packaging/debian-src/debian/control`](packaging/debian-src/debian/control)
— os backends Fedora e Ubuntu/Debian do `vegad` em si, não só o empacotamento,
ainda não foram validados contra uma instalação real). Para instalar a partir
do checkout local em vez do pacote pronto, veja
[`packaging/opensuse/install.sh`](packaging/opensuse/install.sh) (openSUSE,
documentado também em [`CONTRIBUTING.md`](CONTRIBUTING.md) e
[`dependencias.md`](dependencias.md)), `rpmbuild -bb packaging/fedora/*.spec`
(Fedora, ver [`dependencias.md`](dependencias.md)) ou o comentário no topo de
[`packaging/debian-src/debian/rules`](packaging/debian-src/debian/rules)
(Ubuntu/Debian, precisa copiar `debian/` pra raiz do repo antes de rodar
`dpkg-buildpackage`, exigência do próprio `dpkg`).

## Layout do repositório

```
vega/        UI (Electron + TypeScript + React), roda como usuário comum
vegad/       Daemon privilegiado (Go), roda como root, exposto via D-Bus
dbus/        Definições de interface D-Bus (XML de introspecção) — contrato entre vega e vegad
docs/adr/    Decisões arquiteturais e fronteiras de segurança do projeto
packaging/   Unit systemd, policy polkit, conf D-Bus system.d, sysusers.d, PKGBUILDs (Arch), specs RPM (openSUSE, Fedora) e debian/rules (Ubuntu/Debian)
```

## Status

Módulos **Software**, **Pontos de Restauração** e **Backup** funcionais de ponta
a ponta contra Pacman + Flathub + Snapper + Restic (busca, instalar, remover,
listar/aplicar atualizações, limpar cache, criar/listar snapshots e rollback,
configurar backup, rodar backup agora e restaurar snapshots, tudo com
progresso em tempo real via sinais D-Bus). A navegação atual também expõe
**Hardware**, **Kernel**, **Rede e Firewall**, **Usuários** e **Sobre**; o
módulo **Serviços** ainda fica fora da superfície de usuário até ter backend
real — ver "Pendências conhecidas" abaixo.

## Desenvolvimento

### vega (UI)

```
cd vega
npm install
npm run dev
```

### vegad (daemon)

Requer Go instalado (não presente neste ambiente de scaffold):

```
cd vegad
go mod tidy
go build ./...
```

Os PKGBUILDs em `packaging/vega` e `packaging/vegad` empacotam este checkout
local por padrão. Para gerar os dois pacotes em ordem (`vegad` e depois
`vega`):

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

## Nomes D-Bus e polkit

- Bus name: `org.lyraos.Vega1` (system bus)
- Contrato de interfaces (introspecção XML): `dbus/org.lyraos.Vega1.*.xml` — fonte de verdade, mantida em sincronia com `vegad/internal/dbusserver/*.go`
- Actions polkit em `packaging/vegad/org.lyraos.vega.policy`, prefixo `org.lyraos.vega.*`
- `vegad` roda em `/usr/lib/vega/vegad`, unit bus-activated em `packaging/vegad/vegad.service`

## Pendências conhecidas

- **Software**: `Search`, `ListRepos`, `ListUpdates`, `Install`, `Remove`, `UpdateAll`, `SetRepoEnabled` e `ClearCache` rodam de verdade (shell out para `pacman`/`flatpak`, sem libalpm direto ainda — ver comentário em `vegad/internal/dbusserver/pacman.go`). A busca inclui a AUR de verdade (origem "Comunidade") via `yay`/`paru` (o que estiver instalado, `optdepend`), e a UI deduplica resultados por app/origem. Progresso reportado é por estágio (regex sobre a saída do comando), não byte-exato. Instalações Pacman e AUR criam snapshots Snapper pré/pós quando `snapper` está disponível. `vegad-update-check.timer` roda `vegad check-updates` a cada 4h (`packaging/vegad/vegad-update-check.timer`) e, se houver pacotes pendentes, emite o sinal `Software.UpdatesAvailable`; a UI mostra uma notificação nativa (`vega/src/main/index.ts`) apenas se o app estiver aberto no momento — não há componente em segundo plano ainda, mesma limitação que `Backup.BackupAlert` já tinha.
- **Pontos de Restauração**: lista snapshots, cria snapshot manual, faz rollback e ajusta retenção via Snapper quando o binário está instalado
- **Backup**: cria configurações locais em `/etc/vega/backup` por padrão, executa `restic` para backup e restauração, agenda serviços/timers systemd para `daily`/`weekly`, e lista snapshots do repositório
- AUR (`vegad/internal/dbusserver/aur.go`) roda `yay`/`paru -Ssa` e `-S` como `vega-build` dentro de `systemd-run`, nunca como root; o passo final de instalação (`sudo pacman -U` interno do helper) depende da regra NOPASSWD em `packaging/vegad/sudoers.d/vega-build` — a UI mostra o PKGBUILD antes de confirmar, já que essa regra dá a `vega-build` permissão efetiva de instalar pacotes como root
- Hardware, Kernel, Rede/Firewall e Usuários já têm backend básico e telas iniciais; ainda faltam integrações mais profundas e o módulo de Serviços continua fora da navegação do MVP
- PKGBUILDs em `packaging/*/PKGBUILD` usam a fonte versionada do Vega por padrão e aceitam `VEGA_SOURCE_URL`/`VEGA_SOURCE_DIR` para builds locais e empacotamento AUR
- `vegad` implementa `org.freedesktop.DBus.Introspectable` via reflection (`introspect.Methods`, ver `server.go`) — necessário para clientes como `dbus-next` (usado pela UI) que fazem introspecção antes de chamar métodos; `busctl`/`gdbus call` funcionam mesmo sem isso, então esse gap só aparece testando com o mesmo cliente D-Bus que a UI usa
- Suporte a Ubuntu/Debian (`vegad/internal/distro/{apt,kernel_debian,hardware_debian}.go`, `dbusserver/{ufw,timeshift}.go`) é novo e não testado numa instalação real: `SetRepoEnabled` só reconhece linhas que batem exatamente com `apt list`/`sources.list` (sem suporte a PPA via `add-apt-repository`); o backend de Firewall usa `ufw` quando `firewall-cmd` não está presente, e o de Snapshots usa Timeshift quando `snapper` não está — mas Timeshift exige configuração prévia de um dispositivo de backup (diferente do snapper, que já funciona na subvolume raiz), não tem diff de pacotes como o snapper (`DiffPackages` retorna uma mensagem explicativa) e sua política de retenção única (`count_daily`/`weekly`/`monthly`/`hourly`/`boot`) é aproximada para o mesmo valor em vez de configurável por período
- Suporte a Fedora (`vegad/internal/distro/{dnf,kernel_fedora,hardware_fedora}.go`) é novo e não testado numa instalação real (escrito sem acesso a uma máquina Fedora): `ListUpdates` usa `dnf list --upgrades` em vez de `dnf check-update` para evitar os códigos de saída especiais deste último; `GetDetails`/`Search` assumem o formato "Key : Value"/"nome.arch : resumo" documentado do `dnf`, não confirmado contra uma saída real; o driver NVIDIA (`akmod-nvidia`) depende do repositório RPM Fusion nonfree já estar habilitado (Vega não adiciona repositórios de terceiros sozinho) e builda o módulo do kernel de forma assíncrona via `akmods.service`, não durante a própria instalação; `RebuildBootArtifacts` assume GRUB2 clássico (`grub2-mkconfig`) e não cobre o layout BLS/`grubby` que o Fedora 38+ usa por padrão em instalações UEFI
