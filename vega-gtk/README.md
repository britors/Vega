# Vega GTK

Interface oficial do Vega, implementada em Rust, GTK4 e libadwaita. O `vegad`
e o contrato em `../dbus/` formam a fronteira privilegiada do aplicativo. O
pacote e o binário usam o nome `lyra-vega-gtk`.

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

O application ID oficial é `org.lyraos.Vega`.

## D-Bus

O módulo `src/dbus` acessa diretamente o system bus por `zbus`. A interface
`SystemClient` separa a UI do transporte e possui `MockSystemClient` para
testes sem daemon ou privilégios. Os testes de contrato leem os XMLs em
`../dbus/`; divergências de nomes ou assinaturas devem falhar no CI.

Software e Backup expõem `SoftwareEventStream` e `BackupEventStream`. Cada
chamada a `next()` aguarda todos os sinais da interface sem polling e devolve
um evento de domínio tipado; descartar o stream remove as subscriptions D-Bus.
