# Vega End-to-End Validation

Este roteiro cobre a validação local automatizada e o smoke test manual no Lyra OS.

## 1. Validação local automatizada

Rode no checkout do projeto:

```bash
./scripts/qa-smoke.sh
```

O script valida:

- `go test` em `vegad`
- `npm run typecheck` em `vega`
- `npm run build` em `vega`
- sintaxe do helper de empacotamento
- `makepkg --printsrcinfo` dos dois PKGBUILDs
- presença dos contratos D-Bus versionados

## 2. Smoke test no Lyra OS

Executar em uma máquina/VM com os pacotes `vega` e `vegad` instalados.

### 2.1 Base do sistema

```bash
systemctl status vegad.service
busctl tree org.lyraos.Vega1
busctl introspect org.lyraos.Vega1 /org/lyraos/Vega1 org.lyraos.Vega1.System
```

Esperado:

- `vegad` sobe por bus activation
- o nome D-Bus responde
- a introspecção mostra as interfaces do daemon

### 2.2 UI

```bash
vega
```

Verificar:

- a janela abre sem root
- a sidebar mostra Software, Pontos de Restauração, Backup, Hardware, Kernel, Rede e Firewall, Usuários, Serviços e Sobre
- estados vazios e confirmações aparecem nas ações destrutivas

### 2.3 Software

Verificar:

- busca unificada mostra oficiais, Flathub e AUR
- instalação e remoção emitem progresso
- atualização completa exige confirmação
- limpeza de cache retorna sucesso

Falha esperada:

- `pkcheck` ausente ou usuário sem polkit deve bloquear ação privilegiada

### 2.4 Pontos de Restauração

Verificar:

- lista de snapshots Snapper carrega
- criar snapshot manual funciona
- rollback pede confirmação e mostra diff

Falha esperada:

- `snapper` ausente deve deixar a tela em estado informativo, não quebrada

### 2.5 Backup

Verificar:

- criar configuração com destino local
- criar configuração com `destinationUUID` para volume removível
- backup manual conclui com progresso
- snapshot listado com data, contagem e tamanho
- restore em pasta separada não sobrescreve arquivos
- restore parcial funciona a partir de itens do snapshot
- desmontar o destino faz o job `on-connect` adiar sem erro

Falha esperada:

- destino desconectado no horário agendado não conta como erro de usuário
- três falhas reais consecutivas geram alerta

### 2.6 Hardware, Kernel, Rede, Usuários e Serviços

Verificar:

- Hardware mostra CPU/GPU/RAM e firmware
- troca de driver NVIDIA pede confirmação
- Kernel não permite remover o kernel em execução
- Firewall pede confirmação para abrir/fechar serviço
- Usuários pede confirmação para criar/remover conta
- Serviços mostra estado, habilitação e disponibilidade

### 2.7 Upgrade

Verificar:

- instalar uma nova versão do pacote não quebra UI ou daemon
- estado de backup e snapshots sobrevive ao upgrade
- `vegad` continua bus-activated após atualização

## 3. Critérios de aceite

- [ ] O smoke local roda sem erro
- [ ] O pacote abre no alvo sem root
- [ ] Todas as ações privilegiadas passam por polkit
- [ ] Backup e restore funcionam
- [ ] Upgrade preserva estado
- [ ] O roteiro cobre falhas de dependência e serviço parado
