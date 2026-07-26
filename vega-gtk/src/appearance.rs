use gtk::{gio, gio::prelude::*};

const SCHEMA: &str = "org.gnome.desktop.interface";

/// Tema claro/escuro do GNOME inteiro (`color-scheme`), o mesmo valor lido
/// pelo GNOME Shell, Nautilus e qualquer app libadwaita — igual ao painel
/// Aparência das Configurações do GNOME.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

/// Cor de destaque do GNOME inteiro (`accent-color`), suportada nativamente
/// pelo libadwaita 1.6+ (este sistema tem 1.7): mudar aqui já reflete em
/// qualquer app libadwaita em execução, sem precisar reiniciar nada.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccentColor {
    Blue,
    Teal,
    Green,
    Yellow,
    Orange,
    Red,
    Pink,
    Purple,
    Slate,
}

impl AccentColor {
    pub const ALL: [AccentColor; 9] = [
        AccentColor::Blue,
        AccentColor::Teal,
        AccentColor::Green,
        AccentColor::Yellow,
        AccentColor::Orange,
        AccentColor::Red,
        AccentColor::Pink,
        AccentColor::Purple,
        AccentColor::Slate,
    ];

    fn key(self) -> &'static str {
        match self {
            AccentColor::Blue => "blue",
            AccentColor::Teal => "teal",
            AccentColor::Green => "green",
            AccentColor::Yellow => "yellow",
            AccentColor::Orange => "orange",
            AccentColor::Red => "red",
            AccentColor::Pink => "pink",
            AccentColor::Purple => "purple",
            AccentColor::Slate => "slate",
        }
    }

    fn from_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|color| color.key() == key)
    }

    /// Cor sólida usada para pintar o botão-amostra no seletor — a mesma
    /// paleta que o próprio libadwaita usa para essas cores nomeadas.
    pub fn swatch(self) -> &'static str {
        match self {
            AccentColor::Blue => "#3584e4",
            AccentColor::Teal => "#2190a4",
            AccentColor::Green => "#3a944a",
            AccentColor::Yellow => "#c88800",
            AccentColor::Orange => "#ed5b00",
            AccentColor::Red => "#e62d42",
            AccentColor::Pink => "#d56199",
            AccentColor::Purple => "#9141ac",
            AccentColor::Slate => "#6f8396",
        }
    }
}

/// `org.gnome.desktop.interface` é do GNOME, não do vegad — mesma lógica de
/// schema_available() do wallpaper/screensaver, sem depender do backend.
pub fn schema_available() -> bool {
    gio::SettingsSchemaSource::default()
        .and_then(|source| source.lookup(SCHEMA, true))
        .is_some()
}

pub fn current_theme() -> Theme {
    if !schema_available() {
        return Theme::default();
    }
    match gio::Settings::new(SCHEMA).string("color-scheme").as_str() {
        "prefer-dark" => Theme::Dark,
        "prefer-light" => Theme::Light,
        _ => Theme::System,
    }
}

pub fn apply_theme(theme: Theme) {
    if !schema_available() {
        return;
    }
    let value = match theme {
        Theme::System => "default",
        Theme::Light => "prefer-light",
        Theme::Dark => "prefer-dark",
    };
    let _ = gio::Settings::new(SCHEMA).set_string("color-scheme", value);
}

pub fn current_accent_color() -> Option<AccentColor> {
    if !schema_available() {
        return None;
    }
    AccentColor::from_key(gio::Settings::new(SCHEMA).string("accent-color").as_str())
}

pub fn apply_accent_color(color: AccentColor) {
    if !schema_available() {
        return;
    }
    let _ = gio::Settings::new(SCHEMA).set_string("accent-color", color.key());
}
