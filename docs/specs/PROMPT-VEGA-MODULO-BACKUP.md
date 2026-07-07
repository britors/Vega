# PROMPT DE IMPLEMENTAÇÃO — VEGA: MÓDULO BACKUP

> **Versão:** 1.0
> **Status:** Especificação incremental, pronta para implementação
> **Pré-requisitos:** `PROMPT-VEGA.md` v1.0
> **Escopo:** Este documento ADICIONA o módulo **Backup** ao Vega — primeiro item do backlog de módulos futuros, priorizado por ser a lacuna mais séria da proteção de dados oferecida hoje (Snapper protege o sistema; nada no Lyra OS protege `/home` de disco morto, roubo ou perda física). Não redefine nada do `PROMPT-VEGA.md` — apenas estende.

---

## 1. Visão Geral

O módulo **Backup** completa a promessa "seu sistema, protegido" (já comunicada no Lyra Tour, tela 5) cobrindo o que os Pontos de Restauração não cobrem: os arquivos pessoais do usuário, copiados para um destino independente do disco principal.

### 1.1 Princípios

1. **Simplicidade radical na superfície.** Três perguntas ao usuário: o quê, para onde, com que frequência. Tudo o mais tem um padrão sensato.
2. **Motor por trás, não reinventado.** O módulo é uma interface amigável sobre uma ferramenta de backup madura (§2) — o Vega não implementa lógica de deduplicação/criptografia própria.
3. **Backup não é sincronização.** Versionado, incremental, com histórico — não é "pasta espelho".
4. **Restaurar é tão fácil quanto configurar.** Um assistente de restauração simétrico ao de configuração.

---

## 2. Motor de Backup

- **Ferramenta:** `restic` (Go, binário único, repositórios locais/externos/rede, deduplicação e criptografia nativas, licença BSD-2 — compatível com o ecossistema GPLv3 do projeto por ser dependência externa, não código incorporado)
- **Justificativa da escolha sobre `borg`:** `restic` tem binário estático sem dependências pesadas, suporta backends locais, SFTP, e object storage (relevante se o Lyra OS oferecer destino em nuvem no futuro), e sua API de linha de comando é mais simples de orquestrar programaticamente pelo `vegad`
- **Repositório restic:** um por configuração de backup criada pelo usuário; senha do repositório gerada automaticamente e armazenada via `libsecret` (Chaveiro do GNOME) — nunca em texto plano
- **Diagrama de responsabilidade:**

```
Vega (UI)  →  vegad (Go)  →  restic (subprocesso)  →  destino (disco local/externo/rede)
```

---

## 3. Escopo Funcional

### 3.1 O quê fazer backup ("O quê")

- Presets simples, sem navegação em árvore de arquivos por padrão:
  - **Documentos e Área de Trabalho** (`~/Documentos`, `~/Área de Trabalho`, `~/Downloads` — opcional, desmarcado por padrão)
  - **Imagens e Vídeos** (`~/Imagens`, `~/Vídeos`)
  - **Configurações de aplicativos** (`~/.config` — com exclusões de cache conhecidas)
  - **Tudo em Home** (equivalente a `~/`, com exclusões automáticas: `~/.cache`, diretórios de build, `node_modules`, imagens de VM)
- Opção "Avançado": adicionar pastas específicas ou excluir subpastas
- Exclusões automáticas sempre aplicadas independentemente do preset: `.cache/`, `Trash/`, arquivos `.tmp`, imagens de máquina virtual (`.qcow2`, `.vdi`, `.vmdk` — grandes demais para backup incremental típico, aviso exibido se detectado)

### 3.2 Para onde ("Para onde")

| Destino | Suporte |
|---|---|
| Disco/pendrive externo | detecção automática de mídia removível conectada, formatação assistida se necessário |
| Pasta em disco interno secundário | seleção manual de caminho |
| Servidor via rede (SFTP) | endereço, usuário, senha ou chave — avançado |
| Nuvem | fora de escopo nesta versão (ver §7) |

- Ao escolher destino removível, o Vega associa o backup ao **UUID do dispositivo** (não à letra/caminho de montagem), avisando o usuário quando o disco correto não está conectado no horário agendado

### 3.3 Com que frequência ("Quando")

- Presets: **Diário**, **Semanal**, **Ao conectar o dispositivo** (para destino externo), **Manual**
- Agendamento implementado via **systemd timer** por configuração de backup (`vega-backup-<id>.timer`), gerenciado pelo `vegad`
- Se o destino agendado (ex.: HD externo) não estiver conectado no horário, a execução é adiada silenciosamente até a próxima conexão — sem notificação de "falha" alarmante por algo que não é erro do usuário

### 3.4 Notificações

- Notificação de desktop discreta ao concluir backup agendado com sucesso (frequência configurável: sempre / só a primeira do dia / nunca)
- Notificação de alerta apenas quando **3 execuções consecutivas** falharem por motivo real (destino sem espaço, erro de permissão, corrupção de repositório) — evita fadiga de alertas por um HD externo simplesmente desconectado

### 3.5 Restauração

Assistente simétrico ao de configuração:

1. Selecionar a configuração de backup (se houver mais de uma)
2. Navegar o histórico de snapshots do `restic` por data, com contagem de arquivos/tamanho
3. **Restaurar tudo** para o local original, ou **Restaurar itens específicos** (navegação de arquivos dentro do snapshot selecionado)
4. Restauração para local original oferece: "Substituir" ou "Restaurar em pasta separada" (`~/Restaurado-AAAAMMDD/`) — nunca sobrescreve silenciosamente
5. Barra de progresso via sinais D-Bus, mesmo padrão do módulo Software

### 3.6 Painel de Status

Tela inicial do módulo mostrando, por configuração de backup:

- Último backup bem-sucedido (data/hora relativa: "há 3 horas")
- Espaço usado no destino / espaço livre restante
- Próxima execução agendada
- Botão "Fazer backup agora" (execução manual imediata)

---

## 4. Arquitetura no vegad

- Nova interface D-Bus: `org.lyraos.Vega1.Backup`
- Métodos principais: `CreateConfig`, `ListConfigs`, `RunBackupNow(configId)`, `ListSnapshots(configId)`, `RestoreSnapshot(snapshotId, targetPath, mode)`, `DeleteConfig(configId)`
- Sinais: `BackupProgress`, `BackupFinished`, `RestoreProgress`, `RestoreFinished`
- Actions polkit granulares: `org.lyraos.vega.backup.configure`, `org.lyraos.vega.backup.run`, `org.lyraos.vega.backup.restore`
- **Por que passa por privilégio elevado mesmo sendo dados do próprio usuário:** o backup de "Tudo em Home" e a leitura de dispositivos de bloco para detecção de mídia externa exigem acesso consistente independentemente de qual usuário está com sessão ativa (útil no Modo Família futuro); a senha do repositório restic fica no chaveiro do sistema (via `libsecret` invocado pelo vegad), não no `~/.config` do usuário comum, reduzindo superfície de exfiltração caso a conta do usuário seja comprometida
- `vegad` grava e lê a configuração de cada backup em `/etc/vega/backup/<id>.json` (caminhos, destino, frequência — **sem segredos**, que ficam exclusivamente no chaveiro)
- Execução do `restic` via `systemd-run` com propriedades de isolamento (mesma técnica de sandbox usada para builds AUR no módulo Software)

---

## 5. UI/UX

- Ícone do módulo: disco com seta circular, cor de destaque `lyra-blue`
- Estados vazios (nenhum backup configurado ainda) com o Lyro, mensagem: "Ainda não há nada protegido aqui" + botão "Criar meu primeiro backup"
- Assistente de criação em 3 telas (O quê / Para onde / Quando), com resumo final antes de confirmar
- Toda tela de restauração usa o padrão de confirmação do prompt base do Vega (mostrar o que muda antes de agir)

---

## 6. Validação

- [ ] Assistente cria configuração de backup em 3 passos, resumo final correto
- [ ] Backup manual ("Fazer backup agora") completa com sucesso em destino local e em HD externo
- [ ] Timer systemd criado por configuração; execução agendada dispara no horário
- [ ] Destino externo desconectado no horário agendado: execução adiada sem notificação de erro
- [ ] Restauração "Restaurar em pasta separada" não sobrescreve arquivos originais
- [ ] Restauração de item específico funciona a partir da navegação do snapshot
- [ ] Senha do repositório restic recuperável apenas via chaveiro, nunca em texto plano em disco
- [ ] 3 falhas reais consecutivas disparam notificação de alerta; falhas por ausência de destino não disparam
- [ ] `du -sh` do destino após múltiplos backups incrementais confirma deduplicação (crescimento não-linear)
- [ ] Toda ação de configuração/execução/restauração passa por action polkit própria (testar com usuário não-wheel)

---

## 7. Fora de Escopo

- Destino em nuvem (S3-compatível, Backblaze B2 etc.) — `restic` já suporta nativamente; adicionar quando houver demanda
- Backup de sistema completo (imagem de disco) — o Snapper já cobre o sistema; este módulo é para dados pessoais
- Compartilhamento de configuração de backup entre múltiplos usuários (relevante apenas junto ao Modo Família, ainda não especificado)
- Verificação de integridade agendada do repositório (`restic check` periódico) — considerar para v1.1 deste módulo

---

**Fim da especificação.**
