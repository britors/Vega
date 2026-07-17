use std::path::Path;
use std::process::Command;

const DOMAIN: &str = "vega-gtk";

fn main() {
    println!("cargo:rerun-if-changed=po");

    let po_dir = Path::new("po");
    let Ok(entries) = std::fs::read_dir(po_dir) else {
        return;
    };

    if Command::new("msgfmt").arg("--version").output().is_err() {
        println!("cargo:warning=msgfmt não encontrado; pulando compilação dos catálogos de tradução (.po -> .mo)");
        return;
    }

    for entry in entries.flatten() {
        let po_path = entry.path();
        if po_path.extension().and_then(|ext| ext.to_str()) != Some("po") {
            continue;
        }
        let Some(lang) = po_path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };

        // "locale/<lang>/LC_MESSAGES/" espelha o layout que o pacote instala
        // em /usr/share/locale — é o que `TextDomain::prepend` espera achar
        // dentro do diretório que a gente passa (ele sempre soma "locale").
        let out_dir = po_dir.join("locale").join(lang).join("LC_MESSAGES");
        if let Err(error) = std::fs::create_dir_all(&out_dir) {
            println!("cargo:warning=não foi possível criar {}: {error}", out_dir.display());
            continue;
        }

        let mo_path = out_dir.join(format!("{DOMAIN}.mo"));
        match Command::new("msgfmt")
            .arg("-o")
            .arg(&mo_path)
            .arg(&po_path)
            .status()
        {
            Ok(status) if status.success() => {}
            _ => println!(
                "cargo:warning=falha ao compilar {} para .mo",
                po_path.display()
            ),
        }
    }
}
