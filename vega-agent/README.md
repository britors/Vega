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

O agente expõe coletores somente leitura para sistema, hardware, métricas,
processos e volumes. As fontes CIM/Storage são isoladas para que uma consulta
indisponível degrade somente seus campos. A única mutação desse corte é
`process.kill`: ela bloqueia processos críticos, tenta primeiro com o token
normal e abre um broker UAC descartável apenas após `ACCESS_DENIED`.

Os testes de domínio usam um `Collector` fake com Unicode e não dependem do
hardware ou das contas do runner de CI.

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
