# Checkpoint da milestone Qt

Data: 2026-07-16. Objetivo ativo: concluir as issues #76–#89 sem substituir a GTK.

## Implementado

- `vega-qt/`: Qt 6, C++20, CMake, Widgets, D-Bus e Network;
- application ID `org.lyraos.VegaQt`, binário `lyra-vega-qt` e configurações independentes;
- 15 rotas, busca, páginas roláveis, foco/nomes acessíveis e estados de erro/retry;
- cliente D-Bus assíncrono, timeout, reconexão, descarte por ownership e erros distintos;
- leituras e ações dos domínios Software, Backup, Snapshots, Hardware, Kernel,
  Storage, DateTime, Network/Firewall, Bluetooth, Users, Services e Logs;
- buscas/detalhes/listas auxiliares dos contratos expostos, incluindo repositórios,
  histórico de backup, diff de snapshots, bootloader, locale, Wi-Fi e firewall;
- confirmação para toda mutação privilegiada e correlação de progresso por `transactionId`;
- AUR bloqueado até revisão integral do PKGBUILD por ID;
- Assistente Anthropic/OpenAI/Gemini com Secret Service, modelos, histórico privado,
  limite diário, preview dos dados enviados, streaming, timeout, cancelamento,
  auditoria redigida e tools de leitura/mutação com resultados delimitados e
  aprovação explícita;
- pacotes Arch, Fedora, openSUSE e Debian; workflows para as quatro famílias com
  gates de instalação simultânea e remoção independente;
- instalador com `VEGA_UI=gtk|qt|both` e GTK como padrão;
- QA integrado, benchmark Qt e teste automático de coexistência de arquivos.

## Evidências executadas

- `./scripts/qa-smoke.sh`: passou (vegad, GTK e Qt);
- Qt: testes headless passaram, incluindo 20 ciclos de criação/descarte das páginas;
- smoke gráfico Fedora 44: Wayland e X11/xcb passaram;
- container Arch Linux: configuração, build, testes e instalação em staging passaram;
- RPM Fedora construído por `rpmbuild`; nenhum conflito GTK e nenhuma dependência
  privada `libvegaqt_core.so` após tornar o core estático;
- dez amostras Qt: startup médio 233,9 ms, PSS médio 60.391,2 KiB,
  CPU média 0,40%, binário 295.872 bytes;
- manifesto instalado Qt não compartilha caminhos com a GTK.

## Pendências que exigem ambiente externo

- executar os novos gates dos workflows em Arch, openSUSE e Ubuntu/Debian reais;
- instalação, upgrade e remoção simultânea em VMs descartáveis das quatro famílias;
- leitor de tela e escala fracionária com avaliação humana;
- operações polkit reais com sucesso, negação e cancelamento;
- testes com contas reais dos três provedores do Assistente;
- proxies gerados cobrem System/Logs; estruturas complexas usam o decoder D-Bus
  genérico validado contra os XMLs.

## Retomada

```sh
git status --short
./scripts/qa-smoke.sh
env VEGA_QT_BENCHMARK_SETTLE_SECONDS=1 ./scripts/benchmark-qt.sh 10
./scripts/check-qt-coexistence.sh
```

O estado detalhado está em `docs/qt-parity.md`, `docs/qt-validation.md` e
`docs/qt-architecture.md`.
