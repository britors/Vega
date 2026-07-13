# Handoff — conclusão da migração Windows (#61)

Atualizado em 2026-07-13. Este arquivo registra o ponto exato para retomar o
trabalho sem depender do histórico da conversa.

## Estado publicado

O branch `main` e `origin/main` estão em `df0acde`.

Issues Windows implementadas e enviadas:

- `cb5defd` — rede, Wi-Fi e firewall (#57);
- `7049ccf` — usuários, data e hora (#58);
- `eaa300e` — backup Restic (#59);
- `df0acde` — Bluetooth, wallpaper e monitores (#60).

Também já estão publicados os ajustes anteriores de Microsoft Store,
auto-update, feedback das configurações da IA e ocultação de Pontos de
Restauração/Kernel no Windows.

## Alterações locais ainda não commitadas

Somente estes arquivos estão modificados:

- `vega/package.json`;
- `vega/package-lock.json`.

Eles atualizam o Electron de `31.7.7` para `43.1.0`. A atualização foi baixada,
mas ainda **não foi validada, commitada ou enviada**. Electron 43 requer Node
`>= 22.12.0`; portanto o workflow Windows, hoje em Node 20, precisa mudar para
Node 24 antes de aceitar esta alteração.

Não descartar essas mudanças sem revisar. Primeiro executar testes, typecheck,
build e empacotamento. Se houver incompatibilidade relevante, decidir entre
adaptar o toolchain ou reverter apenas essa atualização.

## Issue #61 — trabalho restante

### 1. Testes automatizados

- adicionar fuzz tests ao decoder do protocolo: frames truncados, tamanho
  inválido, campos duplicados/desconhecidos e JSON arbitrário;
- adicionar teste de timeout/encerramento do agente, além dos testes já
  existentes de nonce, replay e limite de payload;
- criar testes compartilhados do contrato mínimo `SystemClient` para mock e
  cliente Windows;
- extrair o despacho/validação do broker para uma função testável com executor
  falso; provar que operação desconhecida e parâmetros inválidos não chegam ao
  executor;
- incluir negative tests de todas as mutações críticas e verificar que senhas,
  nonces e chaves não aparecem em resultados/logs.

### 2. CI e release gate Windows

O workflow `.github/workflows/windows.yml` já executa Go, testes Electron,
typecheck, build, NSIS, Authenticode em tags, checksums e metadata do updater.
Ainda falta:

- atualizar `actions/setup-node` de Node 20 para Node 24 caso Electron 43 seja
  mantido;
- verificar que versão do `package.json`, nome do instalador e ProductVersion
  do `Vega.exe` coincidem;
- smoke silencioso do NSIS: instalar, iniciar com
  `VEGA_SYSTEM_BACKEND=mock`, confirmar que o processo permanece aberto e
  desinstalar;
- confirmar que o agente foi instalado/removido e que o diretório de auditoria
  possui a ACL esperada;
- manter assinatura válida obrigatória somente em release por tag e publicar
  checksum SHA-256;
- criar um gate/manual approval para release que exija evidência da matriz
  manual. Não marcar a matriz como aprovada automaticamente.

### 3. Segurança e dependências

- atualizar o threat model da ADR 0001 para refletir a implementação real e
  registrar divergências, especialmente o que ainda não possui teste de
  integração assinado;
- revisar toda invocação de PowerShell. Scripts constantes/EncodedCommand são
  aceitáveis; nenhuma entrada do renderer pode ser concatenada no script;
- confirmar `sandbox: true`, `contextIsolation: true` e
  `nodeIntegration: false` por teste estático (a configuração atual já usa os
  três valores);
- o `npm audit` atual reporta 13 vulnerabilidades. As críticas vêm da cadeia
  legada `dbus-next -> usocket -> node-gyp -> request`, usada no backend Linux
  e explicitamente excluída do pacote Windows. Documentar a exceção do pacote
  Windows, mas não alegar que o repositório inteiro está sem vulnerabilidades;
- Vite 5/electron-vite 2 também têm advisories de desenvolvimento. Avaliar a
  atualização separadamente, pois é uma migração major e não deve ser misturada
  sem testes com o upgrade do Electron.

### 4. Documentação obrigatória

Criar `docs/windows/qa-release-gate.md` com:

- instalação, atualização, remoção e troubleshooting do agente/WinGet/Event
  Log;
- diferenças Windows x Linux e limitações conhecidas;
- UAC, privacidade e dados enviados à IA;
- roteiro reproduzível de VM para Windows 11 Home/Pro, pt-BR/en-US, conta local
  e Microsoft, usuário padrão/admin, WinGet presente/ausente, UAC
  aprovado/cancelado/inválido, paths com espaço/Unicode/UNC/longo, reboot
  pendente, upgrade, desinstalação, offline e proxy;
- tabela de evidências com versão/build da VM, executor, data, resultado e link
  do artefato/log sem segredos.

Atualizar o `README.md`, que ainda se apresenta como “Centro de controle
unificado para Linux”, com instalação Windows e limitações conhecidas.

## Ordem recomendada para amanhã

1. Validar Electron 43 localmente; ajustar Node do CI e corrigir regressões.
2. Implementar fuzz/negative/contrato/broker fake tests.
3. Criar scripts PowerShell de verificação de versão e smoke NSIS.
4. Integrar os scripts ao workflow Windows.
5. Escrever QA/release gate, threat model e atualizar README.
6. Rodar `go test ./...`, `go vet ./...`, build/vet cruzado para Windows,
   `npm test`, `npm run typecheck`, `npm run build` e `git diff --check`.
7. Commitar e enviar a parte automatizável da #61.
8. Executar a matriz manual em Windows 11. Ela é o único item que não pode ser
   honestamente concluído neste host Linux. Só fechar a #61 e liberar uma tag
   depois de anexar essas evidências.

## Observação de release

Não criar uma nova tag Windows antes do gate manual. O código das issues
#57–#60 está no `main`, mas a migração Windows ainda não deve ser declarada
totalmente concluída enquanto a #61 permanecer sem evidência em Windows real
ou VM.
