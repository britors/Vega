# Checkpoint da milestone Qt

Data: 2026-07-16. Objetivo ativo: concluir as issues #76–#89 sem substituir a GTK.

## Implementado

- `vega-qt/`: Qt 6, C++20, CMake, Widgets, D-Bus e Network;
- application ID `org.lyraos.VegaQt`, binário `lyra-vega-qt` e configurações independentes;
- 15 rotas, busca, páginas roláveis, foco/nomes acessíveis e estados de erro/retry;
- navegação por teclado restaura o foco no título da página selecionada;
- dados de domínio carregam somente na primeira visita; páginas ainda não abertas
  não geram chamadas D-Bus, com estado coberto por controlador headless;
- temas Sistema, Claro e Escuro com preferência Qt persistente e independente;
  o modo Sistema acompanha mudanças de esquema de cores reportadas por GNOME/KDE;
- cliente D-Bus assíncrono, timeout, reconexão, descarte por ownership e erros distintos;
- proxies Qt gerados para os 14 contratos em escopo e tipos complexos registrados,
  com assinaturas verificadas automaticamente;
- leituras e ações dos domínios Software, Backup, Snapshots, Hardware, Kernel,
  Storage, DateTime, Network/Firewall, Bluetooth, Users, Services e Logs;
- buscas/detalhes/listas auxiliares dos contratos expostos, incluindo repositórios,
  histórico de backup, diff de snapshots, bootloader, locale, Wi-Fi e firewall;
- configuração de backup e restauração parcial com o tipo D-Bus estruturado
  `(sassss)` registrado e validado em teste;
- seletores nativos Qt para VPN, restauração e transferência Bluetooth, usando
  integração de portal do desktop em sessões Wayland;
- Sobre exibe versões Vega Qt/Qt, canal, licença e links, além de consultar
  versão do vegad, distribuição e conectividade;
- confirmação para toda mutação privilegiada e correlação de progresso por `transactionId`;
- apenas métodos que realmente iniciam operações longas registram `transactionId`;
  IDs síncronos, como o de criação de snapshot, não deixam progresso órfão;
- AUR bloqueado até revisão integral do PKGBUILD por ID;
- Assistente Anthropic/OpenAI/Gemini com Secret Service, modelos, histórico privado,
  limite diário, preview dos dados enviados, streaming, timeout, cancelamento,
  auditoria redigida e tools de leitura/mutação com resultados delimitados e
  aprovação explícita;
- mensagens, respostas e resultados de tools do Assistente são inseridos apenas
  como texto literal, sem interpretação de HTML remoto;
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
- dez amostras Qt após carregamento sob demanda: startup médio 154,3 ms,
  PSS médio 63.602,1 KiB, CPU média 0,70%, binário 888.072 bytes;
- contraste de texto normal nos temas Claro/Escuro validado em pelo menos 4,5:1
  e 750 trocas de rota sem recarregar domínios já visitados;
- manifesto instalado Qt não compartilha caminhos com a GTK.

## Pendências que exigem ambiente externo

- executar os novos gates dos workflows em Arch, openSUSE e Ubuntu/Debian reais;
- instalação, upgrade e remoção simultânea em VMs descartáveis das quatro famílias;
- leitor de tela e escala fracionária com avaliação humana;
- operações polkit reais com sucesso, negação e cancelamento;
- testes com contas reais dos três provedores do Assistente;

## Retomada

```sh
git status --short
./scripts/qa-smoke.sh
env VEGA_QT_BENCHMARK_SETTLE_SECONDS=1 ./scripts/benchmark-qt.sh 10
./scripts/check-qt-coexistence.sh
```

O estado detalhado está em `docs/qt-parity.md`, `docs/qt-validation.md` e
`docs/qt-architecture.md`.
