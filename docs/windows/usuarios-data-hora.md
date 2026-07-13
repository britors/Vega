# Usuários locais e data/hora no Windows

## Contas

O Vega enumera contas locais com SID e associação ao grupo Administrators pelo
SID bem conhecido `S-1-5-32-544`; nomes traduzidos do grupo não fazem parte da
decisão. Contas externas encontradas são apresentadas como Microsoft/domínio e
permanecem somente leitura.

Criação, remoção e mudança de administrador passam pelo broker descartável e
solicitam UAC. A senha inicial:

- é obrigatória no Windows e validada nos dois lados do pipe;
- entra como JSON pelo pipe autenticado, nunca em argv ou script concatenado;
- não é gravada em logs, auditoria ou enviada à IA;
- é convertida em `SecureString` somente dentro do broker elevado.

Contas internas, os RIDs 500/501 e o último administrador local utilizável são
protegidos no backend. Ao remover uma conta, a UI exige escolha explícita sobre
preservar ou excluir o perfil local.

## Data e hora

O backend usa IDs nativos do Windows, como `E. South America Standard Time`, e
não tenta convertê-los silenciosamente para IANA. Alterar timezone ou o estado
do serviço W32Time solicita UAC e persiste pelo mecanismo do próprio Windows.

Locale e layout de teclado são exibidos em modo somente leitura neste corte.
Alterá-los pode exigir language pack e novo login; esse fluxo foi deliberadamente
deferido em vez de reportar sucesso falso.

## Validação manual pendente

- Windows 11 Home e Pro, pt-BR e en-US;
- conta local e Microsoft Account;
- usuário padrão, administrador filtrado e UAC cancelado;
- política de senha corporativa;
- máquina em domínio/Entra;
- persistência de timezone e W32Time após reinicialização.

Esses cenários fazem parte do gate da issue #61.
