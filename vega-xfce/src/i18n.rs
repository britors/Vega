use gettextrs::TextDomain;

const DOMAIN: &str = "vega-xfce";

/// Inicializa o gettext lendo o idioma da sessão (`LANGUAGE`/`LC_MESSAGES`/
/// `LANG`, como qualquer app GTK) — não há seletor de idioma manual, o
/// próprio SO decide. Sem tradução instalada para esse idioma, `TextDomain`
/// deixa o domínio sem bind e `gettext()` volta a retornar o texto original
/// (pt_BR, o idioma fonte do código).
pub fn init() {
    // Além dos caminhos padrão do sistema (/usr/share/locale, usado pelo
    // pacote instalado), procura também os .mo que o build.rs acabou de
    // gerar em `po/`, pra `cargo run` local funcionar sem instalar nada.
    let result = TextDomain::new(DOMAIN)
        .prepend(concat!(env!("CARGO_MANIFEST_DIR"), "/po"))
        .init();
    if let Err(error) = result {
        eprintln!("i18n: seguindo com o texto original (pt_BR); {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_does_not_panic_regardless_of_locale() {
        init();
    }
}
