# Vega GTK

Interface oficial do Vega, implementada em Rust, GTK4 e libadwaita. O `vegad`
e o contrato em `../dbus/` formam a fronteira privilegiada do aplicativo. O
pacote e o binário usam o nome `vega-gtk`.

## Dependências no openSUSE Leap

```bash
sudo zypper install rust cargo gtk4-devel libadwaita-devel
```

Quem usa `rustup` pode omitir os pacotes `rust` e `cargo`. O MSRV declarado no
manifest é Rust 1.92, exigido pela geração atual de bindings.

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

## Internacionalização

Português (pt_BR) é o idioma fonte: as strings de UI ainda estão fixas no
código (a extração via gettext está sendo feita aos poucos, ver issues
`i18n` no repositório). O idioma da interface é lido automaticamente do SO
(`LANG`/`LC_ALL`, como qualquer app GTK) em `src/i18n.rs` — não há seletor
manual.

`build.rs` compila cada `po/<lang>.po` para `po/locale/<lang>/LC_MESSAGES/
vega-gtk.mo` automaticamente a cada `cargo build` (usa `msgfmt`; se não
estiver instalado, o build segue normalmente e a UI cai no texto original em
português). Para testar um catálogo localmente sem instalar o pacote:

```bash
LANG=en_US.UTF-8 cargo run --manifest-path vega-gtk/Cargo.toml
```

Atualizar o template depois de mexer nas strings (requer o extrator `xtr`,
que entende sintaxe Rust — `xgettext --language=C` quebra em lifetimes e
char literals):

```bash
cargo install xtr
xtr src/main.rs -o po/vega-gtk.pot
msgmerge --update po/en.po po/vega-gtk.pot
```
