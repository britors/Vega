# Backup/Restic no Windows

O Vega oferece o módulo **Backup** no Windows, mas não expõe a aba, o card nem operações de Pontos de Restauração. Snapper/Timeshift e System Restore têm garantias diferentes; o Vega não promete snapshot transacional no Windows.

## Armazenamento e segredo

- Configurações por usuário: `%LOCALAPPDATA%\Vega\backup\configs`.
- Cada repositório recebe uma senha aleatória de 256 bits.
- A senha é persistida somente como um blob DPAPI vinculado ao usuário atual e nunca entra na linha de comando ou na definição da tarefa.
- O agente entrega a senha ao processo filho Restic apenas pelo ambiente do processo e limpa o buffer em memória ao concluir.
- Excluir uma configuração remove a tarefa, a configuração e o segredo local, mas não apaga o repositório de backup.

## Destinos e agendamento

O backend aceita drive letter (`D:\VegaBackup`), UNC (`\\servidor\share\Vega`), volume GUID (`\\?\Volume{...}\`) e caminhos Unicode/longos aceitos pelo Windows e pelo Restic instalado. Para mídia removível, o campo de volume pode receber `E:` ou um volume GUID; o destino vira a pasta relativa dentro desse volume.

- `manual`: nenhuma tarefa.
- `daily`: diariamente às 19:00.
- `weekly`: domingo às 19:00.
- `on-connect`: verificação a cada 15 minutos; se volume/share estiver ausente, a execução falha sem criar dados no disco errado.

As tarefas executam `vega-agent.exe --run-backup <id>` no contexto do usuário e não contêm senha. Na desinstalação, o instalador chama `--cleanup-backup-tasks`; repositórios do usuário permanecem intocados.

## Restauração segura

O bloqueio é aplicado no backend para ambos os modos. Não é permitido restaurar na raiz de um volume, em `%SystemRoot%`, `%ProgramFiles%`, `%ProgramFiles(x86)%` ou `%ProgramData%` (inclusive subpastas), nem diretamente na raiz do perfil do usuário. Use uma pasta dedicada, por exemplo `%USERPROFILE%\VegaRestored`.

`separate-folder` cria `restored-<snapshot>` dentro do destino. `replace` remove apenas o destino previamente validado e então restaura nele. A lista de itens é passada ao Restic como argumentos separados, sem shell.

## Dependência e validação manual

`restic.exe` deve estar no `PATH`; quando ausente, a capacidade informa a dependência `restic` e a criação explica como corrigir.

Validar no gate #61, em VM Windows com snapshot externo:

1. repositório em NTFS local, mídia USB e share UNC;
2. origens/destinos com Unicode e path longo;
3. execução manual e tarefas daily/weekly/on-connect;
4. mídia removida antes da execução;
5. restauração total e parcial em pasta dedicada;
6. bloqueio de `C:\`, Windows, Program Files, ProgramData e perfil do usuário;
7. inspeção da tarefa e dos arquivos para confirmar ausência de senha em texto claro;
8. desinstalação remove tarefas e preserva o repositório.
