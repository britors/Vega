# Contribuindo com o Vega

Obrigado por contribuir com o Vega. Este projeto combina uma interface nativa
Rust/GTK4 com o daemon `vegad`, que executa operações de sistema via D-Bus e
polkit. Mudanças devem ser pequenas, revisáveis e cuidadosas com a segurança do
sistema.

## Ambiente

- Rust 1.92 ou mais recente, GTK4 e libadwaita para a interface em `vega-gtk/`.
- Go para o daemon em `vegad/`.
- Linux com systemd, D-Bus e polkit para testar integracoes reais.
- Em Arch, use os scripts em `scripts/` e os PKGBUILDs em `packaging/vega/` e `packaging/vegad/` para validar instalacao local.
- Em openSUSE Leap, use `packaging/opensuse/install.sh` (e `uninstall.sh`) para validar instalacao local.
- Em Fedora, use `rpmbuild -bb --define "version X.Y.Z" packaging/fedora/{vegad,vega}.spec` para validar instalacao local (ainda nao ha install.sh/uninstall.sh dedicados, so os specs).

## Fluxo de trabalho

1. Abra uma issue ou use uma issue existente para explicar o problema.
2. Crie uma branch curta e descritiva.
3. Mantenha o escopo da mudanca focado.
4. Atualize UI, cliente tipado, daemon e arquivos D-Bus quando uma API nova atravessar essas camadas.
5. Inclua mensagens de erro claras quando uma dependencia opcional nao estiver instalada.

## Validacao

Antes de enviar uma alteracao, rode pelo menos:

```bash
cd vegad
GOCACHE=/tmp/vega-gocache go test ./...
```

```bash
cd vega-gtk
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Quando a mudanca tocar empacotamento, D-Bus, polkit ou integracao com ferramentas do sistema, rode tambem o smoke test aplicavel em `scripts/` e documente o ambiente usado.

## Backend e permissoes

- Metodos somente leitura nao devem exigir polkit.
- Acoes que alteram o sistema devem passar por `requirePolkit`.
- Prefira comandos padrao do sistema e trate ausencia deles com erro legivel.
- Operacoes de alto risco, como kernel, bootloader, pacotes e rollback, devem criar snapshot quando possivel.
- A UI acessa apenas os métodos tipados publicados nos XMLs em `dbus/`.
- Nunca mova autorização para a UI: toda mutação privilegiada deve continuar
  protegida no `vegad` por polkit.

## Frontend

- Siga os padroes visuais existentes: telas densas, claras e sem estados vazios genericos.
- Toda acao destrutiva ou global ao sistema deve pedir confirmacao.
- Loading, erro e vazio precisam ser tratados explicitamente.
- Clientes e mocks em `vega-gtk/src/dbus/` devem acompanhar qualquer alteração
  no contrato.

## Commits e pull requests

- Use mensagens objetivas, em portugues ou ingles, descrevendo o efeito da mudanca.
- Descreva testes executados no PR.
- Informe riscos residuais, principalmente quando depender de hardware, bootloader, NetworkManager, pacman, zypper, flatpak, snapper ou restic.
- Evite refatoracoes amplas junto de mudancas funcionais.

## Licenca

Ao contribuir, voce concorda que sua contribuicao sera distribuida sob a licenca GPLv3 do projeto.
