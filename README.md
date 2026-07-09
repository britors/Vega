# Vega

Centro de controle unificado do Lyra OS. Ver especificação completa em
[`docs/specs/PROMPT-VEGA.md`](docs/specs/PROMPT-VEGA.md) e no incremento
[`docs/specs/PROMPT-VEGA-MODULO-BACKUP.md`](docs/specs/PROMPT-VEGA-MODULO-BACKUP.md).

## Layout do repositório

```
vega/        UI (Electron + TypeScript + React), roda como usuário comum
vegad/       Daemon privilegiado (Go), roda como root, exposto via D-Bus
dbus/        Definições de interface D-Bus (XML de introspecção) — contrato entre vega e vegad
packaging/   Unit systemd, policy polkit, conf D-Bus system.d, sysusers.d, PKGBUILDs
docs/specs/  Especificações congeladas que orientam a implementação
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

### Pacotes locais para o ISO do Lyra OS

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
