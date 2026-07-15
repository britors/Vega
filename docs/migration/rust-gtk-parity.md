# Matriz de paridade Rust + GTK4

Esta é a lista de aceite funcional entre a UI Electron atual e a UI nativa.
Os estados iniciais indicam que a correspondente Rust ainda não foi validada.

Estados permitidos: `pendente`, `em desenvolvimento`, `validado` e
`desvio aprovado`. Um desvio precisa apontar para a decisão que o aprovou.

| Issue | Módulo | Superfície obrigatória | Estado Rust |
|---|---|---|---|
| #66 | Painel | saúde, atalhos, navegação e estados parciais | em desenvolvimento |
| #66 | Hardware | inventário, firmware e troca de driver confirmada | em desenvolvimento |
| #66 | Sobre | versões da UI/backend, distro e conexão | em desenvolvimento |
| #67 | Software | busca, detalhes, instalados, atualizações, repositórios, AUR, cache e mirrors | em desenvolvimento |
| #68 | Backup | configurações, execução, progresso, snapshots e restauração parcial | em desenvolvimento |
| #68 | Pontos de Restauração | listar, criar, comparar, excluir, aplicar e retenção | em desenvolvimento |
| #69 | Kernel | instalados, disponíveis, instalar, remover e bootloader | em desenvolvimento |
| #69 | Data/Hora | timezone, NTP, locale e keymap | em desenvolvimento |
| #69 | Armazenamento | volumes, uso, montar e desmontar | em desenvolvimento |
| #70 | Rede/Firewall | interfaces, Wi-Fi, IPv4, VPN, proxy, zonas e serviços | em desenvolvimento |
| #70 | Desktop | Bluetooth e transferência de arquivos | em desenvolvimento |
| #71 | Usuários | listar, criar, remover e papel administrativo | em desenvolvimento |
| #71 | Serviços | listas curada/completa, enable, start, stop e restart | em desenvolvimento |
| #71 | Logs | filtros, unidades, limite e conteúdo extenso | em desenvolvimento |
| #72 | Monitor | métricas, processos, ordenação, polling visível e encerramento | desvio aprovado |
| #73 | Assistente | provedores, streaming, tools, aprovação, limites, histórico, credenciais e auditoria | em desenvolvimento |

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

O cutover da issue #75 requer todas as linhas como `validado` ou `desvio
aprovado`, nenhum bloqueador de acessibilidade e os resultados preenchidos no
documento de baseline. A validação deve incluir instalação limpa e upgrade nas
quatro famílias de distribuição.
