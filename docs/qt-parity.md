# Matriz de paridade Qt

| Superfície | Contrato | Rota | Estado |
|---|---|---:|---|
| Painel / Sobre | System | sim | saúde, distro, versões, licença e links |
| Software | Software | sim | leitura + ações principais |
| Backup | Backup | sim | configurar, listar, executar e restaurar total/parcial |
| Pontos de Restauração | Snapshots | sim | leitura + criar/aplicar/excluir |
| Hardware | Hardware | sim | leitura + driver |
| Kernel | Kernel | sim | leitura + instalar/remover |
| Armazenamento | Storage | sim | leitura + montar/desmontar |
| Data, Hora e Idioma | DateTime | sim | leitura + aplicar |
| Rede / Firewall | Network, Firewall | sim | leitura + Wi-Fi/firewall |
| Bluetooth | Bluetooth | sim | leitura + energia/parear/remover/enviar |
| Usuários | Users | sim | leitura + criar/remover/papel |
| Serviços | Services | sim | leitura + executar/reiniciar |
| Logs | Logs | sim | filtros, consulta e até 2.000 linhas roláveis |
| Assistente | cliente HTTP + vegad | sim | provedores, streaming, keyring, histórico, limites, tools e consentimento |

As ações acima usam chamadas assíncronas ao system bus, confirmação para impacto relevante,
campos secretos não persistentes e mensagens distintas para indisponibilidade, timeout,
capability ausente e polkit negado. “Shell” ainda não representa paridade funcional completa.
