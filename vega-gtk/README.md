# Vega GTK

Implementação nativa, ainda experimental, da interface do Vega. Ela convive
com a UI Electron até a aprovação de paridade, acessibilidade e desempenho.
O `vegad` e o contrato em `../dbus/` permanecem compartilhados pelas duas UIs.
O pacote e o binário nativos usam o nome `lyra-vega-gtk`; o diretório permanece
`vega-gtk/` durante a migração.

## Dependências no Fedora

```bash
sudo dnf install rust cargo gtk4-devel libadwaita-devel
```

Quem usa `rustup` pode omitir os pacotes `rust` e `cargo`. O MSRV declarado no
manifest é Rust 1.92, exigido pela geração atual de bindings; ele será confrontado com as demais distribuições antes
do empacotamento final.

## Desenvolvimento

```bash
cargo run --manifest-path vega-gtk/Cargo.toml
cargo test --manifest-path vega-gtk/Cargo.toml
cargo clippy --manifest-path vega-gtk/Cargo.toml --all-targets -- -D warnings
```

O application ID temporário `org.lyraos.Vega.Gtk.Devel` e o modo non-unique
permitem executar instâncias de medição sem assumir o lugar da UI oficial.

## D-Bus

O módulo `src/dbus` acessa diretamente o system bus por `zbus`. A interface
`SystemClient` separa a UI do transporte e possui `MockSystemClient` para
testes sem daemon ou privilégios. Os testes de contrato leem os XMLs em
`../dbus/`; divergências de nomes ou assinaturas devem falhar no CI.

Software e Backup expõem `SoftwareEventStream` e `BackupEventStream`. Cada
chamada a `next()` aguarda todos os sinais da interface sem polling e devolve
um evento de domínio tipado; descartar o stream remove as subscriptions D-Bus.
