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
Para lançar uma nova versão:

1. Dar `git tag vX.Y.Z` no commit desejado e `git push origin vX.Y.Z`
2. Atualizar `pkgver=X.Y.Z` (e resetar `pkgrel=1`) nos dois PKGBUILDs
3. Se for só uma correção de empacotamento sem mudar o código (mesma tag),
   basta subir `pkgrel`

## Fluxo de publicação

1. Enviar `lyra-vega` e `vegad` para o AUR
2. Confirmar geração de `.SRCINFO`
3. Validar instalação limpa em chroot Arch
4. Validar upgrade in-place sem perder estado do usuário

## Observações

- Este caminho não cobre distros Arch-like sem `systemd`
- Funções dependentes de `snapper`, `restic`, `flatpak`, `firewalld`,
  `fwupd` e `NetworkManager` continuam funcionais quando os binários
  estiverem presentes, mas não são pré-requisitos do pacote básico
