# Rede, Wi-Fi e firewall no Windows

O módulo Rede usa integrações nativas do Windows atrás do agente tipado. A UI
Electron continua sem acesso direto ao PowerShell, Win32 ou ao broker elevado.

## Funcionalidades

- inventário de adaptadores, endereços IPv4/IPv6, gateway, DNS, MAC e link;
- descoberta, conexão e desconexão Wi-Fi pela Native Wifi API (`wlanapi.dll`);
- leitura e alteração do proxy do usuário em `HKCU`;
- leitura separada do proxy WinHTTP, sem alterá-lo silenciosamente;
- leitura dos perfis Domain, Private e Public do Defender Firewall;
- criação e ativação/desativação de regras de permissão gerenciadas pelo Vega;
- IPv4/DNS estático com captura do estado anterior e rollback se a aplicação
  falhar.

VPN permanece fora deste corte: no Windows não existe equivalência segura para
assumir que todo perfil é OpenVPN. A seção de VPN continua disponível somente
no backend Linux.

## Elevação e validação

Wi-Fi e proxy do usuário rodam na sessão normal. IPv4 estático e mutações do
firewall passam pelo broker descartável e solicitam UAC por operação.

O agente e o broker validam novamente adaptador, prefixo, gateway, DNS,
protocolo, porta, perfil, serviço e path de programa. Scripts PowerShell são
constantes compiladas no agente; dados da UI entram somente como JSON em
`stdin`, nunca como trecho de script ou argumento concatenado. Senhas Wi-Fi não
são enviadas à IA, logs ou auditoria.

Somente regras cujo identificador começa com `Vega-` e cujo grupo é `Vega`
podem ser alteradas. Regras provenientes de Group Policy são exibidas como
somente leitura. O Vega não modifica a política padrão dos perfis nem regras de
terceiros.

Cada mutação registra eventos `before`/`after` em
`%LOCALAPPDATA%\Vega\network-audit.jsonl`. O registro contém apenas ação, fase,
resultado e horário; SSID, senha, IP, proxy, path e identificadores de rede não
são gravados.

## Validação ainda necessária em hardware

- WPA2 e WPA3 em adaptador físico;
- usuário padrão com UAC aprovado e cancelado;
- máquina ingressada em domínio com regras de GPO;
- adaptadores Hyper-V/VPN e SSID Unicode;
- alteração IPv4 em VM com snapshot externo e sessão remota detectada.

Esses cenários pertencem ao gate manual da issue #61 e não devem ser inferidos
apenas pela compilação cruzada.
