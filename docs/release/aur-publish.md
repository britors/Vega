# AUR Publish Checklist

O Vega e o `vegad` serão publicados no AUR como pacotes de sistema para
instalações Arch-like baseadas em `systemd`.

## Pacotes

- `lyra-vega-gtk`
- `vegad`

## Pré-requisitos

- `systemd`, `dbus` e `polkit` disponíveis no sistema alvo
- `pacman` no daemon
- `cargo` e as dependências de desenvolvimento GTK4/libadwaita para a UI
- `go` para compilar o daemon
- acesso SSH à conta do AUR que mantém `lyra-vega` e `vegad`
  (`ssh aur@aur.archlinux.org list-repos` deve listar os dois)

## Verificações antes do envio

- `makepkg --printsrcinfo` funciona para ambos os PKGBUILDs (se não houver
  `makepkg` disponível, o `.SRCINFO` pode ser editado manualmente — ver
  fluxo abaixo)
- `./scripts/qa-smoke.sh` passa
- o daemon sobe por bus activation em uma instalação Arch-based com `systemd`
- as dependências opcionais continuam opcionais
- os pacotes transitórios `lyrae` e `lyraed` permanecem cobertos por `provides`/`conflicts`

## Versionamento

Desde a `v1.0.0`, `pkgver` é fixo (não mais calculado via `pkgver()`/VCS) e o
`source` de cada PKGBUILD aponta para `#tag=v${pkgver}` no GitHub, não para
`#branch=main`. Ou seja, commits em `main` não mudam mais a versão sozinhos.
Para lançar uma nova versão, dê `git tag vX.Y.Z` no commit desejado e
`git push origin vX.Y.Z` antes de publicar no AUR (o fluxo abaixo é manual e
não dispara sozinho a partir da tag).

Os PKGBUILDs em `packaging/vega/PKGBUILD` e `packaging/vegad/PKGBUILD` neste
repositório devem ficar sempre em sincronia com o que está publicado no
AUR — não há mais bump "só no AUR" que fique fora deste repositório.

## Fluxo de publicação (manual)

Não há mais publicação via GitHub Actions — o workflow que existia
(`.github/workflows/release-aur.yml`) foi removido. A publicação é feita à
mão, direto para os repositórios git do AUR:

1. Atualizar `pkgver` (e `pkgrel` se for só correção de empacotamento) em
   `packaging/vega/PKGBUILD` e `packaging/vegad/PKGBUILD` neste repositório,
   junto com qualquer dependência que tenha mudado. Commitar essa mudança
   normalmente no Vega.
2. Clonar (ou atualizar um clone existente) dos repositórios do AUR:

   ```bash
   git clone ssh://aur@aur.archlinux.org/lyra-vega-gtk.git
   git clone ssh://aur@aur.archlinux.org/vegad.git
   ```

3. Copiar os arquivos atualizados de `packaging/vega/` e `packaging/vegad/`
   (PKGBUILD e os arquivos auxiliares referenciados por `install=` ou copiados
   direto, como `vegad.install`, `vega.desktop`, `vega.svg`,
   `org.lyraos.Vega1.conf`, `org.lyraos.Vega1.service`,
   `org.lyraos.vega.policy`, `vegad.service`) para dentro de cada clone.
4. Gerar o `.SRCINFO`:
   - com `makepkg` disponível: `makepkg --printsrcinfo > .SRCINFO` dentro do
     clone.
   - sem `makepkg` (ex.: build feita fora de Arch): editar `.SRCINFO` à mão,
     atualizando `pkgver`, `pkgrel`, `depends`/`source` conforme o PKGBUILD.
5. Commitar (`Update to X.Y.Z`) e `git push origin master` em cada um dos
   dois repositórios.
6. Confirmar a publicação:

   ```bash
   curl -s "https://aur.archlinux.org/rpc/?v=5&type=info&arg[]=lyra-vega-gtk&arg[]=vegad"
   ```

Isso continua sem validar instalação/upgrade de fato — isso é sempre manual:

1. Validar instalação limpa em chroot Arch
2. Validar upgrade in-place sem perder estado do usuário

## Observações

- Este caminho não cobre distros Arch-like sem `systemd`
- Funções dependentes de `snapper`, `restic`, `flatpak`, `firewalld`,
  `fwupd` e `NetworkManager` continuam funcionais quando os binários
  estiverem presentes, mas não são pré-requisitos do pacote básico
