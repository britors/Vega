# ADR 0002 — Empacotamento Windows com electron-builder e NSIS

- **Status:** aceita para implementação
- **Data:** 2026-07-13
- **Issue:** [#52](https://github.com/britors/Vega/issues/52)

## Decisão

O Vega usará `electron-builder` diretamente e produzirá um instalador NSIS
assistido para Windows 11 x64. A instalação será sempre por máquina, em
`Program Files`, e exigirá elevação no instalador.

Essa escolha atende à ADR 0001: o Electron e o agente precisam estar em um
diretório que o usuário comum não possa substituir antes de solicitar UAC. O
aplicativo continua abrindo com token normal; somente o instalador e brokers
descartáveis são elevados.

## Conteúdo do pacote

- aplicativo Electron em ASAR;
- `resources/bin/vega-agent.exe`, compilado com `GOOS=windows`, `amd64`,
  `CGO_ENABLED=0`, `-trimpath` e símbolos removidos;
- ícone multirresolução derivado do SVG oficial;
- atalhos no Menu Iniciar e metadata `org.lyraos.vega` / `Vega`;
- diretório `%ProgramData%\Vega\Audit` com herança removida e acesso integral
  somente para `SYSTEM` e administradores.

No NSIS por máquina, `SetShellVarContext all` faz `$APPDATA` resolver para o
diretório comum `%ProgramData%`; o hook não usa o AppData do administrador que
aprovou o UAC.

Falhar ao aplicar a ACL aborta a instalação. A desinstalação remove arquivos
de máquina, mas preserva preferências do usuário em `%APPDATA%`, permitindo
upgrade e reinstalação sem perder configuração.

## Assinatura e release

Releases por tag usam Authenticode SHA-256 com timestamp RFC 3161. Credencial
e senha entram apenas pelos secrets `WIN_CSC_LINK` e
`WIN_CSC_KEY_PASSWORD`; nunca são gravadas em arquivo versionado ou artefato
intermediário. O workflow falha em tags se instalador ou executáveis não
possuírem assinatura válida.

Builds de pull request produzem artefato não assinado somente para validação,
sem publicação pública. Cada artefato publicado acompanha checksum SHA-256 e
a versão do `package.json` é derivada da tag.

## Alternativas rejeitadas

- **Electron Forge:** adicionaria uma segunda camada sem benefício, pois
  assinatura/publicação continuariam delegadas ao electron-builder.
- **MSIX/AppX:** sandbox, identidade e distribuição exigiriam mudanças extras
  nas integrações administrativas do MVP.
- **MSI:** o ecossistema atual exigiria tooling adicional para custom actions
  e assinatura.
- **Squirrel:** prioriza instalação por usuário, incompatível com a proteção
  do broker em `Program Files`.

## Consequências

- Windows on ARM e instalação por usuário permanecem fora do primeiro release;
- certificado Authenticode válido é gate obrigatório de release pública;
- teste em VM limpa, upgrade, rollback e desinstalação continuam obrigatórios
  na matriz da #61.
