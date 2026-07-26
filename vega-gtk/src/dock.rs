use std::path::PathBuf;

use gettextrs::gettext;
use gtk::{gio, gio::prelude::*, glib};

const EXTENSION_UUID: &str = "sheliak@lyraos.org";
const SCHEMA_ID: &str = "org.gnome.shell.extensions.sheliak";
const SCHEMA_PATH: &str = "/org/gnome/shell/extensions/sheliak/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DockSettings {
    pub position: String,
    pub hide_mode: String,
    pub hide_delay_ms: u32,
    pub icon_size: u32,
    pub edge_margin: u32,
    pub animation: bool,
    pub show_running: bool,
    pub show_trash: bool,
    pub show_apps_button: bool,
    pub fullscreen_hide: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DockError(String);

impl std::fmt::Display for DockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for DockError {}

/// Ao contrário de wallpaper/screensaver, o schema do Sheliak não fica no
/// diretório global do glib-2.0: como toda extensão GNOME Shell, ele é
/// empacotado dentro do próprio diretório da extensão. Por isso precisamos
/// achar essa pasta e carregar o schema explicitamente dali, em vez de usar
/// `SettingsSchemaSource::default()`.
fn extension_dir() -> Option<PathBuf> {
    let mut candidates = vec![
        glib::user_data_dir()
            .join("gnome-shell/extensions")
            .join(EXTENSION_UUID),
    ];
    for base in ["/usr/share", "/usr/local/share"] {
        candidates.push(
            PathBuf::from(base)
                .join("gnome-shell/extensions")
                .join(EXTENSION_UUID),
        );
    }
    candidates
        .into_iter()
        .find(|dir| dir.join("metadata.json").is_file())
}

pub fn is_installed() -> bool {
    extension_dir().is_some()
}

fn open_settings() -> Option<gio::Settings> {
    let dir = extension_dir()?;
    let source = gio::SettingsSchemaSource::from_directory(
        dir.join("schemas"),
        gio::SettingsSchemaSource::default().as_ref(),
        false,
    )
    .ok()?;
    let schema = source.lookup(SCHEMA_ID, false)?;
    Some(gio::Settings::new_full(
        &schema,
        None::<&gio::SettingsBackend>,
        Some(SCHEMA_PATH),
    ))
}

pub fn current() -> Option<DockSettings> {
    let settings = open_settings()?;
    Some(DockSettings {
        position: settings.string("position").to_string(),
        hide_mode: settings.string("hide-mode").to_string(),
        hide_delay_ms: settings.uint("hide-delay"),
        icon_size: settings.uint("icon-size"),
        edge_margin: settings.uint("edge-margin"),
        animation: settings.boolean("animation"),
        show_running: settings.boolean("show-running"),
        show_trash: settings.boolean("show-trash"),
        show_apps_button: settings.boolean("show-apps-button"),
        fullscreen_hide: settings.boolean("fullscreen-hide"),
    })
}

pub fn apply(settings: &DockSettings) -> Result<(), DockError> {
    let gsettings = open_settings().ok_or_else(|| {
        DockError(gettext(
            "A extensão Sheliak não está instalada ou não pôde ser encontrada.",
        ))
    })?;
    let _ = gsettings.set_string("position", &settings.position);
    let _ = gsettings.set_string("hide-mode", &settings.hide_mode);
    let _ = gsettings.set_uint("hide-delay", settings.hide_delay_ms);
    let _ = gsettings.set_uint("icon-size", settings.icon_size);
    let _ = gsettings.set_uint("edge-margin", settings.edge_margin);
    let _ = gsettings.set_boolean("animation", settings.animation);
    let _ = gsettings.set_boolean("show-running", settings.show_running);
    let _ = gsettings.set_boolean("show-trash", settings.show_trash);
    let _ = gsettings.set_boolean("show-apps-button", settings.show_apps_button);
    let _ = gsettings.set_boolean("fullscreen-hide", settings.fullscreen_hide);
    Ok(())
}
