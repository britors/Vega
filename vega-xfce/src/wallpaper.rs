use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Command,
};

use gettextrs::gettext;
use gtk::glib;

const CHANNEL: &str = "xfce4-desktop";
const CATALOG_DIRS: &[&str] = &[
    "/usr/share/gnome-background-properties",
    "/usr/local/share/gnome-background-properties",
];
const IMAGE_DIRS: &[&str] = &["/usr/share/backgrounds", "/usr/share/xfce4/backdrops"];
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "svg", "webp", "jxl", "bmp", "avif"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WallpaperEntry {
    pub name: String,
    pub light_path: PathBuf,
    pub dark_path: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WallpaperError(String);

impl std::fmt::Display for WallpaperError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for WallpaperError {}

/// O XFCE guarda o papel de parede no canal `xfce4-desktop` do xfconf, uma
/// propriedade por monitor/workspace — diferente do GNOME (dconf/gsettings),
/// por isso essa funcionalidade não passa pelo vegad: é preferência da sessão
/// do usuário, não configuração de sistema, e um daemon root não tem como
/// escrever de forma confiável na sessão xfconfd de um usuário logado.
pub fn schema_available() -> bool {
    Command::new("xfconf-query")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

pub fn list_wallpapers() -> Vec<WallpaperEntry> {
    let mut catalog_entries = Vec::new();
    for dir in CATALOG_DIRS {
        catalog_entries.extend(parse_catalog_dir(Path::new(dir)));
    }
    if let Some(home) = glib::home_dir().to_str().map(PathBuf::from) {
        catalog_entries.extend(parse_catalog_dir(
            &home.join(".local/share/gnome-background-properties"),
        ));
    }

    let mut by_light_path = BTreeMap::<PathBuf, WallpaperEntry>::new();
    // Variantes escuras já aparecem penduradas numa entrada de catálogo
    // (dark_path); sem esse controle, a varredura de fallback abaixo lista
    // o mesmo arquivo de novo como se fosse um papel de parede à parte.
    let mut known_dark_paths = std::collections::BTreeSet::<PathBuf>::new();
    for entry in catalog_entries {
        if let Some(dark) = &entry.dark_path {
            known_dark_paths.insert(dark.clone());
        }
        by_light_path
            .entry(entry.light_path.clone())
            .or_insert(entry);
    }

    for dir in IMAGE_DIRS {
        for path in scan_image_files(Path::new(dir)) {
            if known_dark_paths.contains(&path) || by_light_path.contains_key(&path) {
                continue;
            }
            by_light_path
                .entry(path.clone())
                .or_insert_with(|| WallpaperEntry {
                    name: display_name_from_path(&path),
                    light_path: path,
                    dark_path: None,
                });
        }
    }

    let mut wallpapers = by_light_path.into_values().collect::<Vec<_>>();
    wallpapers.sort_by_key(|entry| entry.name.to_lowercase());
    wallpapers
}

const THUMBNAIL_WIDTH: i32 = 160;
const THUMBNAIL_HEIGHT: i32 = 96;

/// Pixels já decodificados de uma miniatura, em formato simples (`Vec<u8>` +
/// metadados) para poder atravessar uma thread — `gdk_pixbuf::Pixbuf` não é
/// `Send` (GObject não thread-safe nos bindings), então não dá pra carregar o
/// Pixbuf em si numa `gio::spawn_blocking` e devolver pra thread principal.
pub struct ThumbnailData {
    bytes: Vec<u8>,
    colorspace: gtk::gdk_pixbuf::Colorspace,
    has_alpha: bool,
    bits_per_sample: i32,
    width: i32,
    height: i32,
    rowstride: i32,
}

/// Decodifica as miniaturas já em escala reduzida (não na resolução original
/// do arquivo — muitos desses papéis de parede são 4K) e já cortadas pelo
/// centro no formato do card ("cover", sem distorcer a imagem). Chamada
/// pensada para rodar numa thread de fundo (`gio::spawn_blocking`):
/// decodificar ~30 imagens grandes de uma vez na thread principal trava a UI
/// tempo suficiente pro compositor achar que o app não está respondendo.
pub fn load_thumbnails(entries: &[WallpaperEntry]) -> Vec<Option<ThumbnailData>> {
    entries
        .iter()
        .map(|entry| load_cover_thumbnail(&entry.light_path))
        .collect()
}

fn load_cover_thumbnail(path: &Path) -> Option<ThumbnailData> {
    // Decodifica preenchendo a largura alvo (altura calculada preservando a
    // proporção) e corta o excesso pelo centro. Papéis de parede quase
    // sempre são widescreen, mas se a altura ficar menor que o alvo (imagem
    // mais "quadrada" ou vertical), decodifica pela altura em vez disso.
    let scaled = gtk::gdk_pixbuf::Pixbuf::from_file_at_scale(path, THUMBNAIL_WIDTH, -1, true)
        .ok()
        .filter(|pixbuf| pixbuf.height() >= THUMBNAIL_HEIGHT)
        .or_else(|| {
            gtk::gdk_pixbuf::Pixbuf::from_file_at_scale(path, -1, THUMBNAIL_HEIGHT, true).ok()
        })?;
    Some(crop_center(&scaled, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT))
}

fn crop_center(
    pixbuf: &gtk::gdk_pixbuf::Pixbuf,
    target_width: i32,
    target_height: i32,
) -> ThumbnailData {
    let src_width = pixbuf.width();
    let src_height = pixbuf.height();
    let channels = if pixbuf.has_alpha() { 4 } else { 3 };
    let rowstride = pixbuf.rowstride();
    let target_width = target_width.min(src_width);
    let target_height = target_height.min(src_height);
    let x_offset = (src_width - target_width) / 2;
    let y_offset = (src_height - target_height) / 2;

    let mut bytes = Vec::with_capacity((target_width * target_height * channels) as usize);
    if let Some(pixels) = pixbuf.pixel_bytes() {
        for row in 0..target_height {
            let start = ((y_offset + row) * rowstride + x_offset * channels) as usize;
            let end = start + (target_width * channels) as usize;
            if let Some(slice) = pixels.get(start..end) {
                bytes.extend_from_slice(slice);
            }
        }
    }

    ThumbnailData {
        bytes,
        colorspace: pixbuf.colorspace(),
        has_alpha: pixbuf.has_alpha(),
        bits_per_sample: pixbuf.bits_per_sample(),
        width: target_width,
        height: target_height,
        rowstride: target_width * channels,
    }
}

/// Remonta o Pixbuf a partir dos bytes já decodificados — operação rápida
/// (só empacota o buffer existente), segura de rodar na thread principal.
pub fn thumbnail_to_pixbuf(data: &ThumbnailData) -> gtk::gdk_pixbuf::Pixbuf {
    gtk::gdk_pixbuf::Pixbuf::from_bytes(
        &glib::Bytes::from(&data.bytes),
        data.colorspace,
        data.has_alpha,
        data.bits_per_sample,
        data.width,
        data.height,
        data.rowstride,
    )
}

pub fn current_light_path() -> Option<PathBuf> {
    if !schema_available() {
        return None;
    }
    let property = last_image_properties().into_iter().next()?;
    let value = xfconf_get(&property)?;
    (!value.is_empty()).then(|| PathBuf::from(value))
}

/// Um caminho por combinação de tela/monitor/workspace conhecida pelo
/// xfdesktop — sem uma única chave central como o GNOME, é preciso listar
/// o canal e alterar cada `.../last-image` encontrada para que o papel de
/// parede mude em todos os monitores e workspaces de uma vez.
fn last_image_properties() -> Vec<String> {
    let Ok(output) = Command::new("xfconf-query")
        .args(["-c", CHANNEL, "-l"])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.ends_with("/last-image"))
        .map(str::to_owned)
        .collect()
}

pub fn apply(entry: &WallpaperEntry) -> Result<(), WallpaperError> {
    if !schema_available() {
        return Err(WallpaperError(gettext(
            "O xfconf-query não está disponível neste sistema.",
        )));
    }
    let path = entry.light_path.to_string_lossy().into_owned();
    let properties = last_image_properties();
    if properties.is_empty() {
        // Sistema recém-instalado, sem nenhuma propriedade de backdrop
        // ainda gravada pelo xfdesktop — cria a combinação padrão.
        xfconf_set_string("/backdrop/screen0/monitor0/workspace0/last-image", &path)?;
    } else {
        for property in properties {
            xfconf_set_string(&property, &path)?;
        }
    }
    Ok(())
}

fn xfconf_get(property: &str) -> Option<String> {
    let output = Command::new("xfconf-query")
        .args(["-c", CHANNEL, "-p", property])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// Tenta uma alteração simples primeiro; se a propriedade ainda não existir
/// (sistema onde o xfdesktop nunca gravou essa combinação), recria com `-n`.
fn xfconf_set_string(property: &str, value: &str) -> Result<(), WallpaperError> {
    let updated = Command::new("xfconf-query")
        .args(["-c", CHANNEL, "-p", property, "-s", value])
        .status();
    if updated.is_ok_and(|status| status.success()) {
        return Ok(());
    }
    let created = Command::new("xfconf-query")
        .args([
            "-c", CHANNEL, "-p", property, "-n", "-t", "string", "-s", value,
        ])
        .status();
    if created.is_ok_and(|status| status.success()) {
        Ok(())
    } else {
        Err(WallpaperError(gettext(
            "Não foi possível aplicar o papel de parede.",
        )))
    }
}

fn parse_catalog_dir(dir: &Path) -> Vec<WallpaperEntry> {
    let Ok(read_dir) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut entries = Vec::new();
    for file in read_dir.flatten() {
        let path = file.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("xml") {
            continue;
        }
        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        entries.extend(parse_catalog_xml(&contents));
    }
    entries
}

fn parse_catalog_xml(contents: &str) -> Vec<WallpaperEntry> {
    // Os catálogos do GNOME sempre declaram
    // <!DOCTYPE wallpapers SYSTEM "gnome-wp-list.dtd">, e roxmltree rejeita
    // qualquer DTD por padrão — allow_dtd é necessário mesmo sem resolver o
    // arquivo .dtd externo (não há entidades para expandir).
    let options = roxmltree::ParsingOptions {
        allow_dtd: true,
        ..Default::default()
    };
    let Ok(document) = roxmltree::Document::parse_with_options(contents, options) else {
        return Vec::new();
    };
    document
        .descendants()
        .filter(|node| node.has_tag_name("wallpaper"))
        .filter(|node| {
            node.attribute("deleted")
                .is_none_or(|value| value != "true")
        })
        .filter_map(|node| {
            let name = child_text(node, "name")?;
            let light_path = PathBuf::from(child_text(node, "filename")?);
            if !light_path.is_file() {
                return None;
            }
            let dark_path = child_text(node, "filename-dark")
                .map(PathBuf::from)
                .filter(|path| path.is_file());
            Some(WallpaperEntry {
                name,
                light_path,
                dark_path,
            })
        })
        .collect()
}

fn child_text(node: roxmltree::Node, tag: &str) -> Option<String> {
    node.children()
        .find(|child| child.has_tag_name(tag))
        .and_then(|child| child.text())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

fn scan_image_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(read_dir) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
                continue;
            }
            let is_image = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase())
                .is_some_and(|ext| IMAGE_EXTENSIONS.contains(&ext.as_str()));
            if is_image {
                files.push(path);
            }
        }
    }
    files
}

fn display_name_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace(['-', '_'], " "))
        .map(|stem| {
            stem.split_whitespace()
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                        None => String::new(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_else(|| gettext("Papel de parede"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_wallpaper_catalog_entry_with_existing_files() {
        let dir = std::env::temp_dir().join(format!("vega-wallpaper-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let light = dir.join("light.png");
        let dark = dir.join("dark.png");
        std::fs::write(&light, b"fake").unwrap();
        std::fs::write(&dark, b"fake").unwrap();

        let xml = format!(
            r#"<?xml version="1.0"?>
<wallpapers>
  <wallpaper deleted="false">
    <name>Amber</name>
    <filename>{}</filename>
    <filename-dark>{}</filename-dark>
  </wallpaper>
</wallpapers>"#,
            light.display(),
            dark.display()
        );
        let entries = parse_catalog_xml(&xml);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Amber");
        assert_eq!(entries[0].light_path, light);
        assert_eq!(entries[0].dark_path.as_deref(), Some(dark.as_path()));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deleted_entries_are_skipped() {
        let xml = r#"<?xml version="1.0"?>
<wallpapers>
  <wallpaper deleted="true">
    <name>Old</name>
    <filename>/nonexistent.png</filename>
  </wallpaper>
</wallpapers>"#;
        assert!(parse_catalog_xml(xml).is_empty());
    }

    #[test]
    fn display_name_from_path_title_cases_the_stem() {
        assert_eq!(
            display_name_from_path(Path::new("/tmp/futurecity_dark.webp")),
            "Futurecity Dark"
        );
    }
}
