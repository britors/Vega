# Vega Agent para Windows

Backend nativo usado pelo `WindowsSystemClient`. O agente normal roda com o
token do usuário e conversa com o processo principal Electron por stdio
enquadrado. Operações administrativas iniciam uma instância descartável do
mesmo executável com UAC e usam um named pipe local protegido.

O contrato e o threat model estão em
[`docs/adr/0001-windows-privileged-broker.md`](../docs/adr/0001-windows-privileged-broker.md).

## Segurança do bootstrap

- frames têm tamanho máximo de 1 MiB e schema fechado;
- handshake exige protocolo v1 e nonce aleatório de 256 bits;
- request IDs não podem ser reutilizados na mesma sessão;
- somente operações compiladas no agente são aceitas;
- o pipe usa DACL explícita e rejeita clientes remotos;
- PID, sessão, caminho do executável e token elevado do broker são verificados;
- o broker aceita uma operação, responde e encerra;
- nenhum payload ou segredo é escrito em stderr/log.

O bootstrap expõe apenas `system.ping` e a prova não destrutiva
`broker.proof`. Módulos de domínio são adicionados pelas issues específicas.

## Validação

```bash
GOCACHE=/tmp/vega-agent-gocache go test ./...
GOCACHE=/tmp/vega-agent-gocache GOOS=windows GOARCH=amd64 \
  go build -o /tmp/vega-agent.exe ./cmd/vega-agent
```

Para desenvolvimento do Electron em uma máquina Windows, aponte o executável
local explicitamente:

```powershell
$env:VEGA_AGENT_PATH = "C:\caminho\vega-agent.exe"
npm run dev
```

Builds empacotados procuram o agente em `resources/bin/vega-agent.exe`.
