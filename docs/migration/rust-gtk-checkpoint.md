# Checkpoint da migração Rust + GTK4

Última atualização: 2026-07-15.

## Decisões vigentes

- `vegad` permanece em Go; apenas a interface está sendo migrada.
- A aplicação GTK é paralela à Electron e usa o ID de desenvolvimento
  `org.lyraos.Vega.Gtk.Devel`.
- A janela padrão usa 1280 × 800 para acomodar a grade compacta sem ultrapassar
  a área central em telas Full HD.
- A interface usa Rust, GTK4, libadwaita e clientes D-Bus tipados com `zbus`.
- Nenhuma mutação real de pacotes, cache, mirrors ou drivers foi executada
  durante o desenvolvimento.
- O Monitor do Sistema (#72) foi removido do escopo como desvio aprovado; o
  `lyra-vega-gtk` não duplicará monitores de recursos e processos do desktop.
- Wallpapers e monitores permanecem fora da #70 porque os configuradores
  nativos do desktop já atendem bem; Desktop fica focado em Bluetooth e
  transferência de arquivos.

## Implementado

- Crate/pacote `lyra-vega-gtk` no diretório `vega-gtk/`, tema escuro Lyra e shell próximo ao Electron.
- Sidebar de 240 px, busca de módulos, navegação persistente e cabeçalho nativo.
- Sidebar usa ícones simbólicos nativos para Painel, Software, Backup, Hardware
  e Sobre, herdando as cores do tema e do estado ativo.
- Painel com dados reais de sistema, atualizações, backup, snapshots, serviços e
  uso de disco. A grade foi compactada para até quatro indicadores por linha.
- Páginas de Software, Hardware e Sobre.
- Clientes D-Bus tipados para System, Software, Backup, Hardware, Snapshots e
  Services, com uma única conexão compartilhada.
- Software com busca, instalados, atualizações, detalhes, instalação, remoção,
  atualização geral, limpeza de cache e acompanhamento de transações. Resultados
  equivalentes preservam Oficial, Flathub e AUR com seleção explícita da origem.
- Resultados de Software podem ser alternados entre lista e grade de cartões sem
  perder o pacote ou a origem selecionada. A grade usa até quatro cartões por
  linha, aproximadamente 25% da área útil por item.
- Trocar a aba de Software limpa resultados, seleção e modal anteriores. Linhas
  e cartões exibem o ícone fornecido pelo backend ou uma inicial como fallback.
- Detalhes e ações de pacote são apresentados em um modal nativo amplo, próximo
  ao fluxo da interface Electron.
- Nomes e descrições vindos dos backends são escapados antes de entrar em campos
  com markup do libadwaita.
- Instalações AUR exigem carregar, exibir e confirmar explicitamente o
  PKGBUILD. Falha ao carregar o arquivo bloqueia a instalação.
- Software lista repositórios e oferece ativação, desativação e otimização de
  mirrors com confirmação explícita e retorno de erro do backend.
- Hardware com inventário, firmware e confirmação para troca de driver.
- Kernel possui cliente D-Bus tipado e página inicial com kernels instalados,
  disponíveis, status do bootloader e entradas de boot.
- Kernel permite instalação, remoção e edição do bootloader com confirmações;
  as proteções contra kernel ativo/último kernel permanecem no daemon.
- Kernels já instalados são removidos da lista de opções de instalação.
- Data, Hora e Idioma possui cliente tipado e formulário para timezone, NTP,
  locale e keymap, com valores fornecidos pelo daemon.
- Armazenamento possui cliente e página para volumes, uso, montagem e remoção
  segura de pontos de montagem.
- Rede e Firewall possui interfaces, Wi‑Fi, proxy e estado/serviços reais; redes Wi‑Fi podem ser conectadas/desconectadas, IPv4 estático e proxy global podem ser editados, perfis OpenVPN podem ser importados e regras de serviço podem ser permitidas/bloqueadas com confirmação.
- Desktop possui disponibilidade e estado reais do Bluetooth, dispositivos conhecidos/encontrados e transferência opcional via `bt-obex`; permite ligar/desligar, buscar, parear, conectar, desconectar, enviar e receber arquivos com confirmação.
- Serviços possui listas curada e completa e ações confirmadas de habilitação, execução e reinício.
- Usuários possui listagem, criação, remoção e controle de administração com proteção da conta root.
- Log do Sistema possui filtros de unidade, prioridade, período, texto e limite, com consulta assíncrona ao journal.
- Assistente de IA possui primeira versão nativa com OpenAI, Anthropic e Gemini,
  conversa e histórico persistente, limites diários, auditoria redigida e chaves
  guardadas exclusivamente pelo Secret Service. Tools de leitura, propostas
  confirmadas de software, continuação automática em até vinte etapas,
  apresentação progressiva das respostas e estimativa de custo conhecida estão
  integradas. Instalações AUR permanecem restritas ao fluxo revisável de Software.
- O switch de NTP usa dimensões compactas para manter a proporção das linhas.
- Hardware, Kernel e Data/Hora usam densidade compacta; Kernel organiza as duas
  listas em colunas e textos longos do bootloader não ampliam a janela.
- Backup possui página própria, lista configurações reais e permite execução
  confirmada com progresso e alertas correlacionados pelo ID da transação.
- A configuração selecionada carrega snapshots com data, tamanho e quantidade
  de arquivos; a seleção do snapshot permite inspecionar seus caminhos.
- Restauração parcial permite selecionar caminhos, exige destino e usa pasta
  separada por padrão. O modo de substituição recebe confirmação destrutiva.
- Configurações de backup podem ser criadas por formulário validado e excluídas
  com confirmação destrutiva; a lista é recarregada após cada alteração.
- Pontos de Restauração possui página, navegação e listagem próprias, com
  comparação somente leitura entre o snapshot selecionado e o estado atual.
- Timeshift não é obrigatório: o `vegad` detecta Snapper primeiro e usa
  Timeshift instalado como fallback opcional. Nesta máquina foi detectado
  Timeshift 25.12.4 em `/usr/bin/timeshift`.
- A página oferece criação, exclusão, rollback com revisão prévia do diff e
  política de retenção configurável, todas protegidas por confirmação.
- Contratos XML ampliados para System, Software e Snapshots.
- Documentação de arquitetura, baseline e matriz de paridade em
  `docs/migration/`.

## Estado da validação

- `cargo test`: 30 aprovados e 4 testes do daemon real ignorados
  intencionalmente.
- `cargo clippy --all-targets -- -D warnings`: limpo.
- `cargo fmt`: limpo.
- `git diff --check`: limpo.
- O aplicativo já foi iniciado contra o `vegad` real em smoke tests anteriores.
- A integração Timeshift foi formatada e validada com `go test`; o daemon de
  desenvolvimento foi instalado e reiniciado. O smoke D-Bus retornou
  `Available=true` e listou um snapshot real desta máquina.

## Próxima tarefa recomendada

Avançar para Assistente de IA, credenciais e auditoria (#73), mantendo acabamento
e acessibilidade como revisão contínua.

## Arquivos e cuidados

- O trabalho da migração ainda está sem commit.
- Preservar alterações não relacionadas do usuário.
- `docs/adr/0001-vegad-permanece-em-go.md` já existia como arquivo não rastreado
  e não deve ser sobrescrito sem solicitação.
- Antes de entregar cada etapa, executar:

```bash
/home/rodrigo/.cargo/bin/cargo fmt --manifest-path vega-gtk/Cargo.toml
/home/rodrigo/.cargo/bin/cargo test --manifest-path vega-gtk/Cargo.toml
/home/rodrigo/.cargo/bin/cargo clippy --manifest-path vega-gtk/Cargo.toml --all-targets -- -D warnings
git diff --check
```
