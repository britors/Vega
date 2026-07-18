# QA da migração Rust + GTK4

## Matriz de aceitação

| Área | Cobertura | Estado |
| --- | --- | --- |
| Controladores e modelos | `cargo test --locked`, incluindo clientes e respostas D-Bus simuladas | Automatizado |
| Daemon e contrato privilegiado | `go test ./...` e XMLs D-Bus no smoke | Automatizado |
| Formatação e lint | `cargo fmt --check` e Clippy com warnings como erro | Automatizado |
| Build otimizado | `cargo build --release --locked` | Automatizado |
| Ubuntu/Debian | workflow de DEB em Ubuntu 24.04 | Por release |
| Fedora | workflow de RPM em Fedora atual | Por release |
| openSUSE | workflow de RPM em Leap 16 | Por release |
| Arch Linux | PKGBUILD validado por `makepkg --printsrcinfo` quando disponível | Smoke/Arch |
| Wayland | abertura e fechamento automatizados; navegação e diálogos | Medido + manual por release |
| X11 | mesma sequência, usando `GDK_BACKEND=x11` | Manual por release |
| Nome acessível dos controles | `scripts/a11y-audit.py` percorre a árvore AT-SPI e falha se algum botão/entrada/item focável estiver sem nome acessível | Automatizado |
| Teclado e foco | Tab/Shift+Tab, setas, Enter/Espaço e Escape em todas as páginas | Manual por release |
| Leitor de tela | nomes de controles, estados, progresso e erros com Orca | Manual por release |
| Contraste e escala | tema escuro, alto contraste e escalas 100%/200% | Manual por release |
| Operações privilegiadas | instalar/remover, serviços, firewall, kernel e snapshots | Manual em VM |

## Comandos reproduzíveis

```bash
./scripts/qa-smoke.sh
./scripts/benchmark-ui.sh 10
GDK_BACKEND=x11 ./vega-gtk/target/release/lyra-vega-gtk

# Auditoria de nome acessível (exige a UI rodando e python3-gi com Atspi):
./vega-gtk/target/release/lyra-vega-gtk &
sleep 2
python3 scripts/a11y-audit.py
```

### Sobre a navegação por teclado automatizada

Tentamos automatizar Tab/Shift+Tab/Enter/Escape via
`Atspi.generate_keyboard_event` (a mesma API que ferramentas de teste de
acessibilidade usam). Numa sessão Wayland nativa — e também forçando
`GDK_BACKEND=x11` — os eventos sintéticos não chegam à janela do vega-gtk
de forma confiável (a injeção via AT-SPI depende de XTest, que não atinge
superfícies Wayland puras, e o roteamento de foco X11/XWayland numa sessão
mista não é confiável o suficiente pra garantir que o evento vá pra janela
certa). A auditoria de nome acessível (acima) não depende de injeção de
tecla e é confiável; a navegação por teclado de verdade continua exigindo
um humano num teclado real.

O benchmark gera `docs/migration/rust-gtk-benchmark.csv`. A inicialização é
medida entre o início do processo e `window.present()`. PSS e CPU são coletados
após cinco segundos de estabilização; cada execução usa um processo novo.

Metas de corte: mediana de inicialização até 1 s, PSS estabilizado abaixo de
80 MiB, CPU ociosa próxima de 0%, um processo e ausência de bloqueador de
acessibilidade. As métricas locais e o desvio de abertura fria estão registrados
no baseline; acessibilidade e longa duração permanecem no checklist de release.

## Roteiro manual de release

1. Executar o smoke e dez amostras de benchmark em sessão Wayland limpa.
2. Percorrer todas as páginas somente pelo teclado e depois com Orca.
3. Repetir a navegação básica em X11, alto contraste e escala 200%.
4. Em uma VM descartável, executar uma operação representativa de cada API
   privilegiada e confirmar sucesso, erro e cancelamento.
5. Manter a aplicação aberta por duas horas, alternando páginas e repetindo
   buscas; confirmar que PSS não cresce continuamente.
6. Instalar os quatro formatos gerados e verificar desktop, ícone, atualização
   sobre a versão Electron e remoção limpa.

## Rollback

Durante o primeiro release GTK, a tag anterior continua sendo o rollback. Se
aparecer bloqueador, republicar os pacotes dessa tag; dados e o contrato D-Bus
permanecem compatíveis porque o `vegad` não mudou de stack.
