# Assistente de IA no Windows

O Assistente monta o prompt de sistema e o catálogo de ferramentas a partir das
`capabilities` retornadas pelo agente em cada mensagem. Assim, uma mudança de
backend ou de dependência entra em vigor sem reutilizar ferramentas que já não
estão disponíveis.

## Limites de plataforma

- No Windows, o prompt identifica Windows, a versão do backend, o protocolo,
  os módulos ativos e dependências ausentes.
- O catálogo não anuncia conceitos exclusivos do Linux, como systemd, Snapper,
  AUR, Flatpak, kernel packages ou fwupd.
- Software usa IDs e origens exatos do WinGet. A proposta de instalação mostra
  ID, fornecedor, versão, origem, escopo e contratos antes da confirmação.
- Serviços e logs usam Windows Services e Windows Event Log quando essas
  operações forem anunciadas pelo agente.
- Toda mutação exige confirmação explícita no Vega. UAC é uma segunda barreira:
  aprovar o prompt do Windows não substitui a confirmação no aplicativo.
- Cancelamento ou falha do UAC volta ao modelo como resultado de ferramenta; o
  modelo não pode presumir que a ação foi executada.

## Privacidade e confiança

Resultados de logs, processos, usuários, rede e armazenamento são tratados como
dados externos não confiáveis. Antes de enviar esses resultados ao provedor, o
Vega redige campos de usuário, e-mails, endereços IP e paths locais/UNC. O
conteúdo restante é encapsulado como dado não confiável para que mensagens em
logs ou metadados não sejam interpretadas como instruções.

Chaves dos provedores continuam armazenadas pelo `safeStorage` do Electron. No
Windows isso depende da proteção de dados da conta (DPAPI); se ela não estiver
disponível, o Vega recusa salvar a chave em texto aberto.

O log de auditoria local registra, junto de cada evento, a plataforma, as versões
do backend e protocolo e a lista exata de módulos/operações disponíveis. Entradas
e detalhes também passam por redação defensiva antes de serem gravados.

## Validação

Os testes unitários cobrem catálogos Linux e Windows, remoção de ferramentas após
mudança de capability, ausência de conceitos Linux no prompt do Windows,
starter prompts, redação de dados sensíveis e conteúdo da proposta WinGet. O
workflow nativo `windows-latest` executa esses testes antes de gerar o instalador.
