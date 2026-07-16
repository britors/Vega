# ADR: interface Qt do Vega

Status: aceito (2026-07-16).

## Decisão

A segunda interface usa Qt 6.4+, C++20, Qt Widgets e CMake. Widgets foi escolhido por oferecer
boa integração desktop, acessibilidade madura, menor superfície de runtime que Qt Quick e
disponibilidade nas versões estáveis de Arch, Fedora, openSUSE e Ubuntu/Debian. Apenas módulos
LGPL do Qt (Core, DBus, Widgets e Test) são necessários; distribuição dinâmica preserva os
termos da LGPL.

O binário, application ID, desktop file, ícone, metainfo e configurações são independentes:
`lyra-vega-qt` e `org.lyraos.VegaQt`. A GTK permanece uma interface oficial e não existe
cutover. As duas interfaces consomem o mesmo `vegad` em `/org/lyraos/Vega1`.

## Estado, concorrência e falhas

Estado testável fica fora de widgets. Proxies são gerados com `qdbusxml2cpp` para
todos os contratos em escopo; estruturas complexas possuem tipos registrados e
testes de assinatura. Chamadas usam `QDBusConnection::asyncCall` e
`QDBusPendingCallWatcher`; watchers pertencem à página e são cancelados/ignorados quando ela é
descartada. Operações longas são correlacionadas por `transactionId`. Erros distinguem daemon
ausente, timeout, polkit negado/cancelado, capability ausente e falha genérica. Segredos jamais
são incluídos em mensagens de log.

Dados de cada superfície são carregados somente na primeira visita. O estado de
carregamento de rotas vive em um controlador sem dependência de widgets ou D-Bus,
permitindo teste headless; retry permanece explícito. Cada superfície oferece
loading, conteúdo, vazio, erro e retry. Mutações destrutivas exigem um
diálogo que descreve o impacto. A ordem de tabulação segue a ordem visual, `Ctrl+F` abre busca,
todo controle recebe nome acessível e o layout mínimo é 760×520, com suporte nativo a HiDPI.

## Validação

Build e testes headless rodam no CI. Wayland e X11, leitor de tela, escala fracionária,
coexistência e pacotes das quatro famílias integram a matriz de release. O baseline GTK usa
`scripts/benchmark-ui.sh`; os mesmos comandos devem ser executados com `lyra-vega-qt` e os
resultados versionados antes da primeira release.
