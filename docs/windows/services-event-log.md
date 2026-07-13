# Serviços e Event Log no Windows

## Serviços

O agente enumera somente serviços Win32 pelo Service Control Manager (SCM),
abrindo o SCM e cada serviço com direitos mínimos de consulta. Drivers de
kernel e filesystem não entram na resposta do MVP. A tela oferece uma lista
curada de serviços comuns e, sob demanda, todos os serviços Win32 que a conta
consegue consultar.

Cada item contém nome interno, display name, descrição, estado, startup type e
metadata de proteção. A denylist de serviços essenciais é aplicada duas vezes:
no agente sem privilégio, antes de solicitar UAC, e novamente dentro do broker
elevado. Serviços protegidos não podem ser parados, reiniciados ou desativados.

Start, stop, restart e mudança entre startup automático/desabilitado passam pelo
broker de curta duração. A ação só chega ao SCM depois da confirmação no Vega e
da aprovação do UAC. Cancelar UAC retorna `CANCELED`; como o broker ainda não
executou a ação, o estado não é alterado. Transições aguardam no máximo 30
segundos e retornam um erro de timeout claro.

## Windows Event Log

A leitura ocorre sempre no agente não elevado, com o token do usuário atual.
Não há fallback para broker, SYSTEM ou credenciais alternativas. Canais sem
permissão retornam erro explícito.

O agente aceita apenas estes filtros estruturados:

- canal com caracteres permitidos e até 256 caracteres;
- nível entre erro, aviso, informação e debug;
- período entre 15 minutos, 1 hora, 24 horas, 7 dias ou sem corte;
- texto com até 200 caracteres;
- limite máximo de 500 eventos.

Uma rotina PowerShell fixa recebe os filtros por JSON em `stdin`; nenhum valor é
interpolado no script e XPath livre não é aceito. A consulta tem timeout de 15
segundos e busca no máximo 2.000 registros intermediários. Cada evento retorna
timestamp UTC, provider, event ID, nível e mensagem. Quando a mensagem localizada
não existe, o agente devolve um placeholder em vez de descartar o evento.

Antes de qualquer resultado de Event Log ser enviado a um provedor de IA, a
camada do Assistente redige usuários, e-mails, IPs e paths e marca o conteúdo
como dado externo não confiável.

## Cobertura

Há testes para parâmetros fechados, tentativa de injeção, denylist antes da
elevação, serviço inexistente, timeout de transição, Unicode e evento sem
mensagem localizada. A CI também executa `go vet` e cross-build `windows/amd64`;
a validação funcional de SCM, UAC, System e Application permanece na matriz
nativa de QA em Windows.
