# Validação da interface Qt

Última execução local: 2026-07-16, Fedora 44, GNOME/Wayland, Qt 6.11.1.

## Comandos reproduzíveis

```sh
./scripts/qa-smoke.sh
VEGA_QT_BENCHMARK_SETTLE_SECONDS=5 ./scripts/benchmark-qt.sh 10
QT_QPA_PLATFORM=wayland ./build/vega-qt/lyra-vega-qt
QT_QPA_PLATFORM=xcb ./build/vega-qt/lyra-vega-qt
```

`qa-smoke.sh` executa testes Go, Rust/GTK e Qt, lint GTK, builds release,
contratos XML, metadados Arch, identidades de pacote e smoke Qt nos plugins
offscreen e minimal. Ele instala a Qt numa raiz temporária e compara o manifesto
real com a GTK, falhando diante de qualquer caminho compartilhado. O teste Qt
também cria e descarta todas as páginas vinte
vezes e verifica rotas, fluxos de leitura obrigatórios, acessibilidade,
carregamento sob demanda, correlação de transações, AUR,
Secret Service, redação da auditoria, métodos obrigatórios do contrato e todas
as assinaturas D-Bus estruturadas usadas pelos proxies gerados.

## Resultados locais

| Verificação | Resultado |
|---|---|
| GTK: testes | 37 passaram, 4 integrações ignoradas sem daemon instalado |
| vegad: testes | passou em todos os pacotes Go |
| Qt: build Release e testes | passou |
| Qt: smoke offscreen/minimal | passou |
| Fedora: RPM Qt real | passou |
| RPM: dependência privada ausente | corrigida; não depende de `libvegaqt_core.so` |
| RPM: conflito de arquivo GTK/Qt | nenhum |
| Benchmark Qt (10 amostras) | média 233,9 ms; PSS 60.391,2 KiB; CPU 0,40%; binário 295.872 bytes |

O CSV bruto está em `docs/qt-benchmark.csv`. Uma release exige dez amostras no
hardware de referência, além de execução em VMs Arch, openSUSE e Ubuntu/Debian.

## Matriz manual de release

| Família / sessão | Build | Instalação simultânea | Execução | Remoção independente |
|---|---:|---:|---:|---:|
| Fedora 44 / Wayland | validado | metadados validados | validado | pendente VM descartável |
| Fedora 44 / X11 | validado | metadados validados | validado via xcb | pendente VM |
| Arch / container | build/test/install validado com Qt 6.11.1 | manifesto validado | headless validado | pendente VM |
| openSUSE Leap / Wayland e X11 | workflow criado | pendente CI/VM | pendente CI/VM | pendente CI/VM |
| Ubuntu/Debian / Wayland e X11 | workflow criado | pendente CI/VM | pendente CI/VM | pendente CI/VM |

As linhas pendentes não devem ser declaradas aprovadas sem execução nos ambientes
correspondentes. Os workflows geram artefatos independentes, instalam GTK, Qt e
`vegad` juntos e removem cada interface separadamente, verificando que a outra e
o daemon permanecem. Eles preservam todos os jobs GTK; não existe etapa de cutover.

## Segurança e acessibilidade

- nenhuma operação privilegiada executa shell na UI; todas usam o system bus;
- chaves do Assistente usam somente Secret Service e identidade Qt independente;
- histórico/configurações/auditoria recebem permissões `0600`;
- AUR exige revisão por ID antes de instalar;
- mutações de impacto usam confirmação com Cancelar como padrão;
- negação polkit, cancelamento e timeout possuem estados/mensagens distintos;
- controles possuem nomes acessíveis, foco padrão e busca por `Ctrl+F`;
- a troca de rota por teclado move o foco para um título acessível da nova página;
- caminhos de VPN, restauração e transferência usam seletores nativos Qt em vez
  de depender exclusivamente de entrada manual;
- Qt 6 fornece escala HiDPI e tema claro/escuro do desktop; páginas são roláveis
  na janela mínima de 760×520; o modo Sistema acompanha `QStyleHints::colorScheme`
  no GNOME/KDE e o usuário pode forçar Claro ou Escuro sem alterar a preferência
  da GTK.
