# PROMPT DE IMPLEMENTAÇÃO — VEGA

> **Versão:** 1.0
> **Status:** Especificação de build congelada, pronta para implementação
> **Pré-requisitos:** `PROMPT-LYRA-OS.md` v2.0 e `PROMPT-LYRA-IDENTIDADE.md` v1.0
> **Supersede:** as especificações anteriores de **Lyrae** e **lyraed**. Este documento as substitui integralmente.
> **Escopo:** Vega é o centro de controle do Lyra OS — o "YaST do Lyra" — e o principal diferencial da distro frente às demais. Todas as decisões abaixo estão fechadas.

---

## 1. Visão Geral

**Vega** é o centro de controle unificado do Lyra OS: um único aplicativo onde o usuário administra **software e sistema** — instalar programas, atualizar, trocar driver, voltar no tempo, gerenciar usuários — sem tocar em terminal.

- **Nome:** Vega — a estrela mais brilhante da constelação de Lyra. O centro de controle é a estrela mais brilhante do sistema.
- **Referência de escopo:** YaST (openSUSE), reinterpretado para usuário final não-técnico: mesma abrangência, décimo da complexidade visual.
- **Substitui:** Lyrae (UI) e lyraed (daemon). Absorve também o plano do gerenciador de pacotes gráfico próprio ("nosso Pamac") — não haverá app separado para isso.

### 1.1 Princípios

1. **Complementa, não duplica.** Tudo que o GNOME Settings faz bem (aparência, som, mouse, energia, notificações) permanece lá. Vega cobre o que o GNOME não oferece.
2. **Uma exceção deliberada ao princípio 1:** gestão de software. O GNOME Software continua instalado e funcional (Flatpak), mas o Vega é a experiência recomendada e completa (Pacman + AUR + Flatpak unificados).
3. **UI nunca roda como root.** Toda ação privilegiada passa por polkit + daemon.
4. **Toda transação de sistema é reversível.** Snapshot automático antes de qualquer operação destrutiva.
5. **Zero jargão na superfície.** Termos técnicos existem apenas em telas "Avançado".

### 1.2 Identidade do produto

| Item | Valor |
|---|---|
| Nome do app | Vega |
| Pacote da UI | `vega` |
| Daemon privilegiado | `vegad` (renomeado de `lyraed`) |
| Nome D-Bus | `org.lyraos.Vega1` (system bus) |
| Licença | GPLv3 |
| Canal | Repositório `lyra` (pacotes `vega` e `vegad`) — componente de sistema, **não** vai ao AUR |
| Ícone | Estrela de quatro pontas do logo Lyra, em degradê oficial |
| Idioma | pt-BR (i18n pronta para en-US) |

---

## 2. Arquitetura

### 2.1 Componentes

```
┌────────────────────────────┐
│  Vega (UI)                 │  Electron + TypeScript + React
│  roda como usuário comum   │  design tokens do lyra-branding
└─────────────┬──────────────┘
              │ D-Bus (system bus)
              │ org.lyraos.Vega1
              │ autorização: polkit
┌─────────────┴──────────────┐
│  vegad (daemon)            │  Go, roda como root
│  systemd service           │  única porta de entrada p/ ações privilegiadas
└─────────────┬──────────────┘
              │
   ┌──────────┼──────────┬───────────┬──────────┐
   ▼          ▼          ▼           ▼          ▼
 libalpm   snapper    firewalld   systemd   NetworkManager
(pacman)  (D-Bus)     (D-Bus)     (D-Bus)     (D-Bus)
```

### 2.2 vegad — daemon privilegiado (Go)

- Serviço systemd `vegad.service`, ativação por D-Bus (bus activation — não roda ocioso permanentemente)
- Expõe interfaces D-Bus versionadas: `org.lyraos.Vega1.Software`, `.Snapshots`, `.Hardware`, `.Kernel`, `.Users`, `.Firewall`, `.System`
- **Cada método mapeado para uma action polkit** granular em `/usr/share/polkit-1/actions/org.lyraos.vega.policy` (ex.: `org.lyraos.vega.software.install`, `org.lyraos.vega.kernel.switch`)
- Operações longas (instalação, atualização) emitem sinais D-Bus de progresso (`TransactionProgress`, `TransactionFinished`); a UI nunca faz polling
- Log estruturado no journal (`vegad` como identifier)
- Onde já existe daemon de sistema com API D-Bus (snapper, firewalld, systemd, NetworkManager), o vegad **orquestra** essas APIs — não reimplementa

### 2.3 Regra de ouro para AUR (segurança)

Builds de pacotes AUR **jamais rodam como root**:

- vegad mantém um usuário de sistema dedicado `vega-build` (sem shell, home em `/var/lib/vega/build`)
- Fluxo: download do PKGBUILD → **exibição do PKGBUILD na UI com diff em atualizações** → build via `makepkg` como `vega-build` em sandbox (systemd-run com propriedades de isolamento) → instalação do pacote resultante via libalpm como root
- Pacotes AUR são claramente rotulados na UI ("Comunidade — não verificado pelo Lyra OS") com aviso na primeira instalação

---

## 3. Módulos

Navegação: sidebar com ícones + busca global (a busca encontra qualquer configuração de qualquer módulo, estilo YaST/GNOME Settings).

### 3.1 Software ★ (o módulo-estrela)

Unifica **três origens** numa única experiência de busca/instalação:

| Origem | Rótulo na UI | Backend |
|---|---|---|
| Repos oficiais Arch + repo `lyra` | "Oficial" | libalpm via vegad |
| Flathub | "Flathub" | libflatpak (sessão do usuário quando `--user`, vegad quando `--system`) |
| AUR | "Comunidade" | fluxo sandbox §2.3 |

Funcionalidades:

- Busca unificada com filtro por origem; deduplicação inteligente (mesmo app em múltiplas origens → card único com seletor de origem, padrão: Oficial > Flathub > Comunidade)
- Página do app: descrição, screenshots (AppStream), tamanho, origem, botão instalar/remover
- Fila de transações com progresso em tempo real (sinais D-Bus)
- **Snapshot Snapper automático antes de cada transação Pacman** (pré/pós, integrado à política do prompt base)
- Atualizações: aba única mostrando updates de todas as origens, botão "Atualizar tudo"; nunca atualização automática silenciosa — sempre com consentimento
- Gestão de repositórios (avançado): visualizar repos Pacman, habilitar/desabilitar multilib
- Cache: limpeza de cache Pacman e runtimes Flatpak órfãos

### 3.2 Atualizações e Pontos de Restauração

- Timeline visual de snapshots Snapper (data, gatilho, descrição)
- "Voltar no tempo": seleção de snapshot → confirmação com diff de pacotes (o que muda ao restaurar) → rollback via snapper + aviso de reinicialização
- Criação manual de snapshot com nome
- Configuração da política de retenção (simplificada: sliders "quantos manter")

### 3.3 Hardware e Drivers

- Inventário legível: CPU, GPU, RAM, discos, bateria
- **Troca de driver NVIDIA**: detecção da geração (mesma `hwdb/nvidia-generations.json` do instalador), opções válidas apenas (`nvidia-open-dkms` / `nvidia-580xx-dkms` / `nouveau`), aplicação com snapshot automático + rebuild initramfs + aviso de reboot
- Firmware: status do `fwupd` (atualizações de firmware via LVFS)

### 3.4 Kernel

- Trocador entre `linux-zen` (padrão) e `linux-lts` (fallback): instalação/remoção + regeneração GRUB
- Nunca permite remover o kernel em execução nem deixar o sistema com zero kernels

### 3.5 Rede e Firewall

- Visão consolidada das conexões (via NetworkManager D-Bus) — leitura e diagnóstico ("testar conexão")
- Firewall (firewalld): liga/desliga, zona ativa, abrir/fechar portas por serviço com nomes amigáveis ("Compartilhamento de arquivos", não "porta 445")
- Edição fina de conexões continua no GNOME Settings (princípio 1) — Vega linka para lá

### 3.6 Contas e Usuários

- Criar/remover usuários, alterar senha, foto (incluindo avatar Lyro), grupo administrador (wheel)
- Configurações que o GNOME Settings não expõe: regras sudo simplificadas ("pode administrar o sistema: sim/não")

### 3.7 Serviços (Avançado)

- Lista curada de serviços systemd relevantes ao usuário final (impressão, bluetooth, firewall, compartilhamentos) com liga/desliga
- Modo avançado: lista completa de units com status — somente leitura + start/stop/enable/disable com polkit

### 3.8 Data, Hora e Idioma

- Timezone (mapa), NTP on/off, formato de data/hora
- Idioma do sistema e geração de locales adicionais

### 3.9 Sobre

- Logo, "Lyra OS", slogan (*Harmonia. Performance. Liberdade.* — lido da fonte única), versão dos componentes, links (site, comunidade, reportar problema), informações de hardware resumidas

---

## 4. UI/UX

- **Stack:** Electron + TypeScript + React; tokens de `palette.json` (lyra-branding) com fallback embutido
- **Layout:** janela redimensionável (mín. 1024×700), sidebar escura `lyra-night-alt` com módulos, conteúdo em cards
- **Estética:** dark-first, degradê oficial em elementos de destaque, Lyro em estados vazios e telas de erro ("Nada por aqui ainda" / "Algo deu errado")
- **Elevação visível:** ações que exigirão senha mostram ícone de escudo antes do clique (o usuário nunca é surpreendido pelo prompt polkit)
- **Transações destrutivas:** sempre com tela de confirmação mostrando o que muda + lembrete "um ponto de restauração será criado antes"
- **Acessibilidade:** navegável por teclado, roles ARIA, contraste AA sobre os fundos escuros

---

## 5. Empacotamento e Integração

### 5.1 Pacotes (repositório `lyra`)

| Pacote | Conteúdo |
|---|---|
| `vega` | UI Electron (`/usr/lib/vega/`, wrapper `/usr/bin/vega`, desktop entry, ícones hicolor) |
| `vegad` | binário Go (`/usr/lib/vega/vegad`), `vegad.service`, conf D-Bus (`/usr/share/dbus-1/system.d/org.lyraos.Vega1.conf`), policies polkit, sysusers.d (`vega-build`) |

- `vega` depende de `vegad`; ambos entram no meta-pacote `lyra-desktop`
- **Transições do rename:** pacotes `lyrae`/`lyraed` viram transitional packages (provides/replaces) por um ciclo de release; nome D-Bus antigo não é mantido

### 5.2 Alterações em cascata nos prompts anteriores

Este documento implica as seguintes correções nos specs já emitidos (aplicar como erratas, sem regerar os documentos):

1. **Prompt base §6.5, §9, §11.1:** ler "Lyrae/lyraed" como "Vega/vegad"; unit habilitada passa a ser `vegad` (bus-activated — presente, não necessariamente `enabled`)
2. **Prompt base §14:** remover "gerenciador de pacotes gráfico próprio" do fora-de-escopo — absorvido pelo Vega §3.1
3. **Lyra Tour §4:** passos 5 e 6 referenciam "Vega" e lançam `vega.desktop`; texto do passo 6: "Vega: a estrela que cuida do seu sistema"
4. **Identidade §4.6:** sem mudança (avatar Lyro independe)

### 5.3 Validação

- [ ] `vega` abre sem privilégios; `ps` confirma UI fora do root
- [ ] Instalação de pacote oficial cria snapshot pré/pós (visível em `snapper list`)
- [ ] Instalação AUR: PKGBUILD exibido antes do build; `ps` durante build confirma `vega-build`, nunca root
- [ ] Busca unificada retorna o mesmo app de múltiplas origens deduplicado
- [ ] Troca de driver NVIDIA em VM com GPU passthrough: snapshot + initramfs + boot ok
- [ ] Trocador de kernel impede remoção do kernel em execução
- [ ] Rollback de snapshot restaura pacote removido
- [ ] Toda action polkit granular dispara prompt correto (testar com usuário não-wheel)
- [ ] Firewall: abrir "Compartilhamento de arquivos" reflete em `firewall-cmd --list-services`
- [ ] Slogan no módulo Sobre idêntico à fonte única (teste automatizado)
- [ ] `vegad` inicia por bus activation e encerra ocioso após timeout

---

## 6. Fora de Escopo (versões futuras)

- Particionador de discos (YaST tem; risco alto demais para v1 — GNOME Disks cobre)
- Gestão de impressoras além do que CUPS/GNOME já oferecem
- Interface web/remota do Vega (estilo Cockpit)
- Vega em modo TUI (YaST ncurses) — avaliar demanda
- Loja com avaliações/comentários de apps

---

**Fim da especificação.**
