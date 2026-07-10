# Contribuindo com o Vega

Obrigado por contribuir com o Vega. Este projeto combina uma interface Electron/React com o daemon `vegad`, que executa operacoes de sistema via D-Bus e polkit. Mudancas devem ser pequenas, revisaveis e cuidadosas com a seguranca do sistema.

## Ambiente

- Node.js e npm para a interface em `vega/`.
- Go para o daemon em `vegad/`.
- Linux com systemd, D-Bus e polkit para testar integracoes reais.
- Em Lyra OS/Arch, use os scripts em `scripts/` e os arquivos de `packaging/` para validar instalacao local.

## Fluxo de trabalho

1. Abra uma issue ou use uma issue existente para explicar o problema.
2. Crie uma branch curta e descritiva.
3. Mantenha o escopo da mudanca focado.
4. Atualize UI, preload, processo principal, daemon e arquivos D-Bus quando uma API nova atravessar essas camadas.
5. Inclua mensagens de erro claras quando uma dependencia opcional nao estiver instalada.

## Validacao

Antes de enviar uma alteracao, rode pelo menos:

```bash
cd vegad
GOCACHE=/tmp/vega-gocache go test ./...
```

```bash
cd vega
npm run typecheck
```

Quando a mudanca tocar empacotamento, D-Bus, polkit ou integracao com ferramentas do sistema, rode tambem o smoke test aplicavel em `scripts/` e documente o ambiente usado.

## Backend e permissoes

- Metodos somente leitura nao devem exigir polkit.
- Acoes que alteram o sistema devem passar por `requirePolkit`.
- Prefira comandos padrao do sistema e trate ausencia deles com erro legivel.
- Operacoes de alto risco, como kernel, bootloader, pacotes e rollback, devem criar snapshot quando possivel.
- Nunca exponha acesso direto do renderer ao D-Bus; use `src/main/dbusClient.ts`, IPC e `src/preload/index.ts`.

## Frontend

- Siga os padroes visuais existentes: telas densas, claras e sem estados vazios genericos.
- Toda acao destrutiva ou global ao sistema deve pedir confirmacao.
- Loading, erro e vazio precisam ser tratados explicitamente.
- O mock em `vega/src/renderer/src/demoVega.ts` deve acompanhar novas APIs expostas no preload.

## Commits e pull requests

- Use mensagens objetivas, em portugues ou ingles, descrevendo o efeito da mudanca.
- Descreva testes executados no PR.
- Informe riscos residuais, principalmente quando depender de hardware, bootloader, NetworkManager, pacman, flatpak, snapper ou restic.
- Evite refatoracoes amplas junto de mudancas funcionais.

## Licenca

Ao contribuir, voce concorda que sua contribuicao sera distribuida sob a licenca GPLv3 do projeto.
