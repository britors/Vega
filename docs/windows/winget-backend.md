# Backend WinGet do Vega

Este documento registra o contrato da issue #53. O backend usa o WinGet que
pertence à sessão do usuário; ele nunca inicia `winget.exe` como `SYSTEM` nem
monta uma linha de comando para shell.

## Descoberta e disponibilidade

Ao iniciar, o agente resolve `winget.exe` e executa `winget --version` com
timeout. Ausência, alias não registrado ou App Installer quebrado aparecem em
`missingDependencies` e mantêm o módulo Software visível com orientação de
reparo. A versão detectada aparece no cabeçalho da tela.

## Fronteira de argumentos

- origens aceitas: somente `winget` e `msstore`;
- IDs e consultas não podem ser vazios, exceder 256 bytes ou conter controles;
- instalação, remoção, detalhe e atualização individual sempre combinam
  `--id`, `--exact` e `--source`;
- o protocolo aceita campos fechados; não existem `override`, `custom`,
  argumentos de instalador ou fragmentos de shell;
- o processo é iniciado com uma lista de argumentos e janela oculta, sem
  `cmd.exe` ou PowerShell;
- `--allow-reboot` nunca é usado.

O ID exato e a origem evitam que um resultado parcial ou duplicado seja
instalado. Essa é também a recomendação da documentação oficial do
[comando install](https://learn.microsoft.com/windows/package-manager/winget/install).

## Confirmação e escopo

Antes de instalar, a UI consulta novamente os detalhes pelo par exato
origem/ID e apresenta nome, fornecedor, versão, origem, escopo, licenças e
contratos. `--accept-package-agreements` só é enviado depois dessa confirmação.

Quando o manifesto reporta `user` e `machine`, a tela oferece as duas opções.
O WinGet continua não elevado; um instalador de máquina pode solicitar UAC por
seu fluxo normal, conforme descrito pela Microsoft em
[considerações administrativas](https://learn.microsoft.com/windows/package-manager/winget/).

## Saída localizada

O CLI ainda não oferece JSON para busca, lista, upgrade e show. O parser não
depende dos nomes das colunas das tabelas: encontra a separação e usa a posição
de nome, ID, versão e origem. Campos de detalhe têm aliases fechados para
`en-US` e `pt-BR`; texto desconhecido não vira argumento.

Fixtures cobrem:

- tabelas em inglês e português;
- nomes, fornecedores e URLs Unicode;
- versão instalada e disponível;
- licença, contratos e escopo;
- HRESULT de licença, cancelamento e reboot.

## Transações e falhas

Instalação, remoção e atualização retornam imediatamente um ID local à UI e
enviam estágios de validação, execução e conclusão. O agente limita leituras a
três minutos e mutações a trinta minutos.

HRESULTs oficiais são traduzidos para mensagens acionáveis. Reinício requerido
é tratado como conclusão que exige ação posterior; cancelamento de UAC,
autenticação ou instalador permanece falha. A referência versionada é a tabela
oficial de [return codes do WinGet](https://github.com/microsoft/winget-cli/blob/master/doc/windows/package-manager/winget/returnCodes.md).
