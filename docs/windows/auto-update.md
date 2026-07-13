# Auto-update do Vega no Windows

O Vega usa o mesmo fluxo manual assistido do Prosa, baseado em
`electron-updater` e no instalador NSIS:

1. uma instalação empacotada verifica a release estável mais recente após a
   janela carregar;
2. quando há versão nova, o usuário escolhe se quer iniciar o download;
3. a interface mostra o progresso e só oferece instalação depois do evento
   `update-downloaded`;
4. “Reiniciar e instalar” fecha o Vega e inicia o instalador NSIS;
5. se o usuário fechar normalmente depois do download, a atualização também
   pode ser aplicada por `autoInstallOnAppQuit`.

O atualizador fica desabilitado no desenvolvimento e fora do Windows. Para um
teste controlado de desenvolvimento, `VEGA_ENABLE_UPDATER=1` habilita apenas no
Windows. Pre-releases e web installers ficam desabilitados.

## Publicação

O electron-builder grava `app-update.yml` no aplicativo e gera, no mesmo build,
o instalador, `latest.yml` e o `.blockmap`. O workflow de tags valida que o path
de `latest.yml` existe e que seu blockmap correspondente também existe antes de
publicar os quatro arquivos na mesma GitHub Release.

Releases Windows exigem Authenticode válido para o executável principal, o
agente e o instalador. Durante o download, o updater valida a soma SHA-512 da
metadata e a assinatura do pacote antes de permitir a instalação.

## Falhas seguras

- Download não começa automaticamente.
- Chamadas duplicadas de download são recusadas.
- Instalação antes de `update-downloaded` é recusada.
- Erros enviados ao renderer têm URLs e paths locais redigidos.
- A release nunca é criada pelo aplicativo; ele somente consome releases
  públicas do repositório configurado.
