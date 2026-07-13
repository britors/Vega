# AUR Publish Checklist

O Vega e o `vegad` serão publicados no AUR como pacotes de sistema para
instalações Arch-like baseadas em `systemd`.

## Pacotes

- `lyra-vega`
- `vegad`

## Pré-requisitos

- `systemd`, `dbus` e `polkit` disponíveis no sistema alvo
- `pacman` no daemon
- `electron31` disponível para a UI
- `go` e `npm` apenas no ambiente de build

## Verificações antes do envio

- `makepkg --printsrcinfo` funciona para ambos os PKGBUILDs
- `./scripts/qa-smoke.sh` passa
- o daemon sobe por bus activation em uma instalação Arch-based com `systemd`
- as dependências opcionais continuam opcionais
- os pacotes transitórios `lyrae` e `lyraed` permanecem cobertos por `provides`/`conflicts`

## Versionamento

Desde a `v1.0.0`, `pkgver` é fixo (não mais calculado via `pkgver()`/VCS) e o
`source` de cada PKGBUILD aponta para `#tag=v${pkgver}` no GitHub, não para
`#branch=main`. Ou seja, commits em `main` não mudam mais a versão sozinhos.
Para lançar uma nova versão, basta dar `git tag vX.Y.Z` no commit desejado e
`git push origin vX.Y.Z` — o workflow abaixo cuida do resto.

Uma correção de empacotamento sem mudar o código (mesma tag) ainda exige
subir `pkgrel` manualmente direto no repositório do AUR, já que o pipeline
só roda a partir de uma tag nova.

## Fluxo de publicação (automático)

[`.github/workflows/release-aur.yml`](../../.github/workflows/release-aur.yml)
dispara em todo push de tag `v*` e, para `lyra-vega` e `vegad` em paralelo:

1. Atualiza `pkgver` (a partir da tag) e reseta `pkgrel=1` no PKGBUILD
2. Gera o `.SRCINFO` e dá push no repositório git do pacote em
   `aur.archlinux.org`, via [`KSXGitHub/github-actions-deploy-aur`](https://github.com/KSXGitHub/github-actions-deploy-aur)

Isso exige o secret `AUR_SSH_PRIVATE_KEY` configurado no repositório GitHub,
com uma chave SSH já cadastrada na conta do AUR que mantém os dois pacotes.
O workflow não valida instalação/upgrade de fato — isso continua manual:

1. Validar instalação limpa em chroot Arch
2. Validar upgrade in-place sem perder estado do usuário

O bump de `pkgver`/`pkgrel` feito pelo workflow é local ao push para o AUR;
ele **não** volta como commit para `packaging/*/PKGBUILD` neste repositório
— os PKGBUILDs versionados aqui servem de referência/base para build local
(`VEGA_SOURCE_DIR`) e ficam alguns releases atrás da versão real publicada
no AUR até o próximo bump manual.

## Observações

- Este caminho não cobre distros Arch-like sem `systemd`
- Funções dependentes de `snapper`, `restic`, `flatpak`, `firewalld`,
  `fwupd` e `NetworkManager` continuam funcionais quando os binários
  estiverem presentes, mas não são pré-requisitos do pacote básico
