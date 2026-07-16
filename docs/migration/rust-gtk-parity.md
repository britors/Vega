# Matriz de paridade Rust + GTK4

Esta é a lista de aceite funcional usada na migração da antiga UI Electron para
a interface nativa. A implementação legada já foi removida dos fontes.

Estados permitidos: `pendente`, `em desenvolvimento`, `implementado`,
`validado` e `desvio aprovado`. `Implementado` indica que a superfície foi
entregue e passou pelos gates automatizados; `validado` exige também a matriz
manual da issue #74. Um desvio precisa apontar para a decisão que o aprovou.

| Issue | Módulo | Superfície obrigatória | Estado Rust |
|---|---|---|---|
| #66 | Painel | saúde, atalhos, navegação e estados parciais | implementado |
| #66 | Hardware | inventário, firmware e troca de driver confirmada | implementado |
| #66 | Sobre | versões da UI/backend, distro e conexão | implementado |
| #67 | Software | busca, detalhes, instalados, atualizações, repositórios, AUR, cache e mirrors | implementado |
| #68 | Backup | configurações, execução, progresso, snapshots e restauração parcial | implementado |
| #68 | Pontos de Restauração | listar, criar, comparar, excluir, aplicar e retenção | implementado |
| #69 | Kernel | instalados, disponíveis, instalar, remover e bootloader | implementado |
| #69 | Data/Hora | timezone, NTP, locale e keymap | implementado |
| #69 | Armazenamento | volumes, uso, montar e desmontar | implementado |
| #70 | Rede/Firewall | interfaces, Wi-Fi, IPv4, VPN, proxy, zonas e serviços | implementado |
| #70 | Desktop | Bluetooth e transferência de arquivos | implementado |
| #71 | Usuários | listar, criar, remover e papel administrativo | implementado |
| #71 | Serviços | listas curada/completa, enable, start, stop e restart | implementado |
| #71 | Logs | filtros, unidades, limite e conteúdo extenso | implementado |
| #72 | Monitor | métricas, processos, ordenação, polling visível e encerramento | desvio aprovado |
| #73 | Assistente | provedores, streaming, tools, aprovação, limites, histórico, credenciais e auditoria | implementado |

Progresso de Software: a instalação de pacotes AUR exige a leitura e a
confirmação explícita do PKGBUILD apresentado pela interface.

Desvio do Monitor (#72): removido do escopo por decisão de produto em
2026-07-15. O módulo duplicaria monitores de sistema maduros do desktop e
adicionaria polling contínuo, gerenciamento de processos e custo de manutenção
sem relevância suficiente para o centro de controle.

Desktop (#70): wallpapers e monitores permanecem fora do escopo porque as
configurações nativas do desktop já atendem bem a esses casos de uso. O Vega se
limita a Bluetooth e transferência de arquivos.

## Critérios transversais por módulo

- [ ] comportamento nominal com `vegad` real;
- [ ] resposta a `vegad` ausente ou desconectado;
- [ ] permissão polkit negada;
- [ ] ferramenta/capability opcional ausente;
- [ ] loading, vazio, erro e recuperação;
- [ ] operação longa não bloqueia a thread GTK;
- [ ] mutação perigosa possui confirmação inequívoca;
- [ ] navegação completa por teclado e foco visível;
- [ ] strings e valores sensíveis não aparecem em logs;
- [ ] teste de modelo/controlador e teste D-Bus mockado;
- [ ] Wayland e X11 quando houver integração com desktop;
- [ ] comportamento por capability nas quatro famílias suportadas.

## Sinais e ciclo de vida

- `Software.TransactionProgress`, `TransactionFinished` e
  `UpdatesAvailable`;
- sinais de progresso, conclusão e alerta de Backup;
- correlação pelo `transactionId`, inclusive sinais atrasados;
- reconexão após o encerramento ocioso e nova ativação do `vegad`;
- descarte de subscriptions e polling ao fechar ou trocar de página.

## Aprovação do cutover

O cutover técnico da issue #75 foi entregue na versão 2.0.0 e corrigido na
2.0.1. A promoção das linhas de `implementado` para `validado` pertence à issue
#74 e requer instalação limpa, upgrade e matriz manual nas quatro famílias de
distribuição.
