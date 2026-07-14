# Dependências e superfície Windows

Revisão executada em 2026-07-14 com Electron 43.1.0 e Node 24. O comando
`npm audit` reporta 13 vulnerabilidades: 2 críticas, 5 altas e 6 moderadas.
O repositório inteiro **não** deve ser descrito como livre de vulnerabilidades.

As críticas e parte das altas vêm da cadeia Linux legada
`dbus-next -> usocket -> node-gyp -> request`. `dbus-next` e `usocket` são
excluídos dos arquivos do pacote Windows, pois o backend Windows usa o agente
Go. Isso reduz a superfície do artefato, mas não substitui a inspeção da lista
final de arquivos: dependências transitivas içadas podem permanecer até a
cadeia Linux ser substituída. Não há correção automática disponível no audit.

Vite 5, electron-vite 2 e esbuild também possuem advisories de servidor de
desenvolvimento. Eles não são servidores expostos pelo aplicativo empacotado,
mas a correção indicada exige migrações major para Vite 8/electron-vite 5.
Essa migração deve ocorrer separadamente, com testes de desenvolvimento e
empacotamento, e não é ocultada pelo upgrade do Electron.

## PowerShell

A revisão das chamadas Windows confirmou o padrão: scripts constantes são
fornecidos por `-EncodedCommand`; valores validados entram por JSON em stdin ou,
no wallpaper, por variável de ambiente após `realpath`. WinGet, Restic e
`schtasks.exe` recebem arrays de argumentos. Nenhuma entrada do renderer é
concatenada em `PowerShell -Command`. Novas chamadas devem manter esse padrão.

## Política do gate

- executar `npm audit` em cada preparação de release e registrar contagens;
- inspecionar o conteúdo final do `win-unpacked` antes de afirmar exclusão;
- bloquear release se surgir advisory explorável no runtime Windows;
- manter advisories de build/dev documentados até a migração major testada.
