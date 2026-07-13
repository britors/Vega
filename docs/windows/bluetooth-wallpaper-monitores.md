# Bluetooth, wallpaper e monitores no Windows

O módulo **Bluetooth e Personalização** reúne integrações executadas no contexto da sessão do usuário. Nenhuma delas exige iniciar o Electron elevado.

## Bluetooth

O agente usa as APIs Win32 de `bthprops.cpl` para enumerar rádio e dispositivos conhecidos/visíveis, consultar pareamento/conexão, iniciar inquiry, parear e remover autenticação. Endereços são aceitos somente no formato `AA:BB:CC:DD:EE:FF` e nunca são interpolados em shell.

- A ausência de rádio retorna `available: false` e não derruba wallpaper ou monitores.
- Pareamento usa `BluetoothAuthenticateDeviceEx`; confirmação/PIN continuam sob controle do Windows.
- Conectar/desconectar, energia e visibilidade abrem `ms-settings:bluetooth`, porque Win32 não oferece uma mutação universal segura para todos os perfis Bluetooth.
- Envio/recebimento abre o assistente nativo `fsquirt.exe`, depois de validar arquivo/pasta local. O usuário conclui destino e consentimento no Windows; o fluxo não é elevado.
- Como o instalador NSIS entrega um aplicativo desktop full-trust e são usadas APIs Win32, não há capability UWP de Bluetooth para declarar no manifesto neste corte.

Referências: [BluetoothFindFirstRadio](https://learn.microsoft.com/windows/win32/api/bluetoothapis/nf-bluetoothapis-bluetoothfindfirstradio), [BluetoothRemoveDevice](https://learn.microsoft.com/windows/win32/api/bluetoothapis/nf-bluetoothapis-bluetoothremovedevice).

## Wallpaper

São listadas imagens JPG/JPEG/PNG/WebP/BMP em `%WINDIR%\Web\Wallpaper`, `Pictures`, `Pictures\Wallpapers` e `Imagens`, com profundidade limitada. A aplicação:

1. exige path absoluto e extensão permitida;
2. rejeita qualquer valor com esquema de URI (`://`);
3. resolve o path real e exige arquivo local não vazio;
4. envia o path via variável de ambiente para um script PowerShell constante;
5. chama `SystemParametersInfoW(SPI_SETDESKWALLPAPER)` e notifica a sessão.

O fallback atual aplica a imagem em todos os monitores. O Windows oferece `IDesktopWallpaper::SetWallpaper` por monitor quando se usa o ID retornado por `GetMonitorDevicePathAt`; essa evolução não é simulada na UI atual. Referências: [SystemParametersInfoW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-systemparametersinfow), [IDesktopWallpaper::SetWallpaper](https://learn.microsoft.com/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-setwallpaper).

## Monitores e rollback

O agente enumera `EnumDisplayDevicesW`/`EnumDisplaySettingsExW`, incluindo nome, label, conexão, monitor principal, resolução, frequência e posição. Modos desconectados, HDR, escala, ativação/desativação e troca do monitor principal ficam somente leitura neste corte.

Ao testar resolução/frequência/posição:

1. o backend aceita apenas `\\.\DISPLAY<n>` e um modo previamente anunciado;
2. chama `ChangeDisplaySettingsExW` com `CDS_TEST`;
3. aplica temporariamente sem persistir no Registro;
4. gera token aleatório e agenda rollback de 15 segundos;
5. só persiste com `CDS_UPDATEREGISTRY` após confirmação; cancelar, expirar ou falhar restaura o `DEVMODEW` anterior.

Referência: [ChangeDisplaySettingsExW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-changedisplaysettingsexw).

## Validação manual no gate #61

Executar em VM com snapshot externo e também em hardware real:

1. notebook sem Bluetooth e notebook com rádio;
2. pareamento/remoção de mouse ou fone e de um telefone;
3. envio e recebimento com dois dispositivos reais pelo assistente nativo;
4. wallpaper com espaços, acentos, japonês e arquivo fora das pastas listadas (deve ser recusado pela UI até ser listado);
5. monitor interno, HDMI/DisplayPort externo e monitor desconectado;
6. confirmar uma troca de modo antes de 15 s;
7. deixar expirar e verificar rollback;
8. cancelar explicitamente e verificar rollback;
9. conferir que HDR, escala, principal e desativação não oferecem mutação.
