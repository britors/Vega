# Gate de QA e release do Vega no Windows

Nenhuma tag Windows deve ser publicada sem os checks automatizados verdes e
uma linha aprovada para cada cenário obrigatório da matriz manual. O environment
GitHub `windows-release` deve ter required reviewers; ele impede a publicação
da release até a aprovação humana das evidências.

## Instalação, atualização e remoção

1. Baixe `Vega-Setup-<versão>-x64.exe` e o `.sha256` da mesma release.
2. Confira `Get-FileHash .\Vega-Setup-*.exe -Algorithm SHA256` e a assinatura
   em Propriedades > Assinaturas Digitais antes de executar.
3. Instale com uma conta administrativa e confirme o UAC. O Vega fica em
   `%ProgramFiles%\Vega`; o agente fica em `resources\bin\vega-agent.exe`.
4. Atualizações são oferecidas pelo próprio aplicativo, mas só são baixadas e
   instaladas após confirmação. Consulte [auto-update.md](auto-update.md).
5. Remova por Configurações > Aplicativos > Vega. A remoção apaga o agente e
   as tarefas de backup criadas pelo Vega.

Para diagnóstico, confirme a presença do WinGet com `winget --version`, veja
o Visualizador de Eventos para falhas do Windows e preserve o log da execução
do workflow. Nunca anexe chave de API, senha, nonce ou conteúdo integral do
diretório de auditoria. A ausência de WinGet ou Restic aparece como capability
indisponível, sem impedir a abertura do aplicativo.

## Diferenças e limitações conhecidas

- Windows usa um agente Go no token do usuário e um broker elevado descartável;
  Linux usa `vegad`, D-Bus e polkit.
- Pontos de Restauração e Kernel não são exibidos no Windows.
- WinGet substitui os gerenciadores Linux. Restic precisa estar no `PATH` para
  backup. Algumas ações de Bluetooth abrem Configurações do Windows.
- Não existe serviço Windows persistente. Cada operação administrativa exige
  um novo consentimento UAC.
- A integração assinada do broker e a matriz abaixo exigem Windows real/VM;
  compilação cruzada em Linux não constitui evidência de release.
- O relatório e as exceções atuais de dependências estão em
  [security-dependencies.md](security-dependencies.md).

## Segurança, UAC e privacidade

O Electron permanece sem elevação. O renderer usa sandbox, isolamento de
contexto e não possui integração Node. O broker aceita uma única operação de
uma allowlist, com DTO fechado, nonce e verificação de processo/sessão. Cancelar
o UAC cancela a ação, sem nova tentativa automática.

O Assistente envia ao provedor escolhido o texto, histórico e resultados das
ferramentas necessários à resposta. Chaves ficam locais e mutações exigem
confirmação. Veja [ai-privacidade.md](../ai-privacidade.md) para a lista exata.

## Matriz manual reproduzível

Crie snapshots limpos de Windows 11 Home e Pro x64, totalmente atualizados.
Execute cada combinação aplicável em pt-BR e en-US:

- conta local e Microsoft; usuário padrão e administrador;
- WinGet presente e ausente; online, offline e proxy autenticado;
- UAC aprovado, cancelado e solicitação inválida/expirada;
- paths com espaço, Unicode, UNC e path longo habilitado/desabilitado;
- instalação limpa, upgrade sobre a versão anterior e desinstalação;
- reboot pendente antes da instalação e após uma operação administrativa.

Em cada VM: valide assinatura/checksum, instale, abra, execute `ping`, consulte
capacidades, teste uma leitura e uma mutação segura de cada módulo disponível,
feche, confirme ausência de agente órfão, atualize quando aplicável e remova.
Teste entradas inválidas sem dados reais. Confirme que o Event Log e os logs
anexados não contêm fixtures secretas.

## Evidências

Copie a tabela para a issue de release. `Resultado` deve ser `aprovado` ou
`falhou`; “não executado” não libera tag.

| Edição/idioma | Build da VM | Conta/token | Cenário | Executor/data UTC | Resultado | Artefato ou log redigido |
| --- | --- | --- | --- | --- | --- | --- |
| Windows 11 Pro pt-BR | preencher | local/admin filtrado | instalação limpa + UAC aprovado | preencher | preencher | preencher |
| Windows 11 Home en-US | preencher | Microsoft/padrão | UAC cancelado + offline | preencher | preencher | preencher |

## Checks automatizados obrigatórios

O workflow Windows executa testes Go/Electron, typecheck, build, NSIS,
consistência entre package/instalador/ProductVersion, smoke silencioso com
backend mock, ACL do diretório de auditoria, presença/remoção do agente,
Authenticode em tags, metadata do updater e SHA-256. A aprovação manual não
pode ser substituída por um status gerado automaticamente.
