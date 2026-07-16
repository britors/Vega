# Matriz de paridade Qt

| Superfície | Contrato | Rota | Estado |
|---|---|---:|---|
| Painel / Sobre | System | sim | leitura |
| Software | Software | sim | leitura + ações principais |
| Backup | Backup | sim | leitura + executar/restaurar |
| Pontos de Restauração | Snapshots | sim | leitura + criar/aplicar/excluir |
| Hardware | Hardware | sim | leitura + driver |
| Kernel | Kernel | sim | leitura + instalar/remover |
| Armazenamento | Storage | sim | leitura + montar/desmontar |
| Data, Hora e Idioma | DateTime | sim | leitura + aplicar |
| Rede / Firewall | Network, Firewall | sim | leitura + Wi-Fi/firewall |
| Bluetooth | Bluetooth | sim | leitura + energia/parear/remover/enviar |
| Usuários | Users | sim | leitura + criar/remover/papel |
| Serviços | Services | sim | leitura + executar/reiniciar |
| Logs | Logs | sim | filtros e consulta |
| Assistente | cliente HTTP + vegad | sim | três provedores, keyring, histórico, limite e cancelamento |

As ações acima usam chamadas assíncronas ao system bus, confirmação para impacto relevante,
campos secretos não persistentes e mensagens distintas para indisponibilidade, timeout,
capability ausente e polkit negado. “Shell” ainda não representa paridade funcional completa.
