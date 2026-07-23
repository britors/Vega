# Arquitetura da migração para Rust + GTK4

Status: arquitetura oficial desde o cutover da versão 2.0.0.

## Objetivos e limites

A nova UI substitui Electron/React por Rust, GTK4 e libadwaita. O `vegad`
permanece em Go, ativado sob demanda, e os XMLs em `dbus/` continuam sendo a
fonte de verdade do contrato privilegiado. A implementação Electron foi
removida após o cutover e não integra os pacotes finais.

Metas de aceite da milestone:

- primeira janela utilizável em até 1 s no ambiente de referência;
- menos de 80 MiB de memória ociosa para toda a árvore da UI;
- CPU ociosa próxima de zero;
- paridade dos 16 módulos atuais;
- Wayland e X11 no openSUSE;
- nenhum Electron, Node ou npm no pacote final.

O desempenho de comandos do sistema não faz parte do ganho esperado da troca
da UI: zypper, flatpak, snapper, timeshift e restic continuam sendo
executados pelo `vegad`.

## Decisões

### Estrutura adotada

A implementação nativa reside em `vega-gtk/`. O pacote e o binário oficiais
usam `lyra-vega-gtk`; o daemon e o nome D-Bus foram preservados.

Estrutura inicial pretendida:

```text
vega-gtk/
├── Cargo.toml
├── resources/
│   ├── org.lyraos.Vega.gresource.xml
│   └── style.css
└── src/
    ├── main.rs
    ├── application.rs
    ├── dbus/
    ├── model/
    ├── ui/
    └── modules/
```

Um único crate é suficiente no início. Novos crates só devem ser extraídos
quando houver uma fronteira testável real; dividir por tela desde o scaffold
criaria complexidade sem isolamento útil.

### Toolkit e estado

- `gtk4-rs` e `libadwaita-rs` formam a camada visual.
- Widgets GTK permanecem na thread principal.
- Estado de domínio não referencia widgets e deve ser testável sem display.
- Páginas reagem a estados explícitos: carregando, conteúdo, vazio, erro e
  backend indisponível.
- Navegação e componentes seguem os padrões do libadwaita; não se replica a
  decoração customizada do Electron quando existe equivalente nativo.

### Assincronismo

Chamadas D-Bus, HTTP e leitura de processos nunca bloqueiam a thread GTK.
Futures que atualizam widgets retornam ao contexto principal do GLib. Toda
tarefa vinculada a uma página deve poder ser cancelada ou ignorar seu resultado
quando a página for destruída.

Polling deve existir somente enquanto a página correspondente estiver visível.
Operações longas usam sinais do daemon e `transactionId`, sem polling de
conclusão.

### D-Bus e segurança

- O cliente nativo acessa diretamente o system bus; não existe substituto para
  a camada IPC do Electron.
- Proxies tipados são gerados ou declarados a partir dos XMLs em `dbus/`.
- Testes de contrato devem falhar quando XML, assinatura Rust e implementação
  exportada divergirem.
- Autorização continua exclusivamente em `vegad` + polkit. Ocultar um botão
  na UI não é controle de acesso.
- Senhas de Wi-Fi, tokens e chaves de IA não entram em logs nem no estado
  persistido em texto puro.
- Seletores de arquivos e integrações do desktop usam APIs GTK/portais
  compatíveis com Wayland, evitando execução de shell na UI.

### Compatibilidade e entrega

O contrato `org.lyraos.Vega1` só deve ser ampliado por necessidade funcional e
qualquer extensão deve ser acompanhada de XML, polkit quando aplicável e testes.

O crate compila no CI e os pacotes oficiais apontam para a interface GTK.

## Portões de qualidade

Uma issue funcional só está concluída quando possui:

1. comportamento de sucesso equivalente;
2. loading, vazio, falha e daemon indisponível;
3. confirmação para mutações de impacto;
4. teste do modelo/controlador sem display;
5. teste com cliente D-Bus mockado;
6. registro atualizado na matriz de paridade;
7. verificação de teclado e foco.

## Decisões do scaffold e próximas validações

O scaffold da issue #63 usa Rust 1.92, `gtk4` 0.11.4 e `libadwaita` 0.9.2.
Esses mínimos ainda precisam ser confrontados com as quatro distribuições
suportadas antes do empacotamento. O backend assíncrono e a biblioteca D-Bus
serão confirmados com um pequeno teste de sinais, cancelamento e reconexão na
issue #64, antes de virarem uma dependência arquitetural permanente.
