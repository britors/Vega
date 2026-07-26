use adw::prelude::*;
use gettextrs::gettext;

use super::{DockPage, ScreensaverPage, WallpaperPage};
use crate::appearance::{AccentColor, Theme};

/// Reúne tudo relacionado a "tela": aparência, bloqueio de tela, papel de
/// parede e o dock do Sheliak (quando instalado) — uma única entrada de
/// navegação com abas internas, como o módulo Software.
#[derive(Clone)]
pub struct ScreenPage {
    pub root: gtk::Widget,
    pub screensaver: ScreensaverPage,
    pub wallpaper: WallpaperPage,
    pub dock: DockPage,
}

impl ScreenPage {
    pub fn new() -> Self {
        let screensaver = ScreensaverPage::new();
        let wallpaper = WallpaperPage::new();
        let dock = DockPage::new();
        let appearance = appearance_page();

        let appearance_tab = tab_button(&gettext("Aparência"));
        let wallpaper_tab = tab_button(&gettext("Papel de Parede"));
        let screensaver_tab = tab_button(&gettext("Proteção de Tela"));
        let dock_tab = tab_button(&gettext("Dock"));
        appearance_tab.set_active(true);
        wallpaper_tab.set_group(Some(&appearance_tab));
        screensaver_tab.set_group(Some(&appearance_tab));
        dock_tab.set_group(Some(&appearance_tab));
        // O Dock (extensão Sheliak) é opcional: a aba só aparece quando a
        // extensão está instalada, seguindo o mesmo padrão de disponibilidade
        // condicional usado pelo resto do Vega (ex.: schema_available()).
        dock_tab.set_visible(crate::dock::is_installed());

        let tabs = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        tabs.add_css_class("module-tabs");
        tabs.append(&appearance_tab);
        tabs.append(&wallpaper_tab);
        tabs.append(&screensaver_tab);
        tabs.append(&dock_tab);

        let stack = gtk::Stack::builder()
            .transition_type(gtk::StackTransitionType::Crossfade)
            .vexpand(true)
            .build();
        stack.add_named(&appearance, Some("appearance"));
        stack.add_named(&wallpaper.root, Some("wallpaper"));
        stack.add_named(&screensaver.root, Some("screensaver"));
        stack.add_named(&dock.root, Some("dock"));
        stack.set_visible_child_name("appearance");

        let appearance_stack = stack.clone();
        appearance_tab.connect_clicked(move |button| {
            if button.is_active() {
                appearance_stack.set_visible_child_name("appearance");
            }
        });
        let screensaver_stack = stack.clone();
        screensaver_tab.connect_clicked(move |button| {
            if button.is_active() {
                screensaver_stack.set_visible_child_name("screensaver");
            }
        });
        let wallpaper_stack = stack.clone();
        wallpaper_tab.connect_clicked(move |button| {
            if button.is_active() {
                wallpaper_stack.set_visible_child_name("wallpaper");
            }
        });
        let dock_stack = stack.clone();
        dock_tab.connect_clicked(move |button| {
            if button.is_active() {
                dock_stack.set_visible_child_name("dock");
            }
        });

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.add_css_class("content-page");
        content.append(
            &gtk::Label::builder()
                .label(gettext("Personalização"))
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(
            &gtk::Label::builder()
                .label(gettext("Aparência, bloqueio de tela e papel de parede"))
                .xalign(0.0)
                .css_classes(["dim-label"])
                .build(),
        );
        content.append(&tabs);
        content.append(&stack);

        Self {
            root: content.upcast(),
            screensaver,
            wallpaper,
            dock,
        }
    }
}

impl Default for ScreenPage {
    fn default() -> Self {
        Self::new()
    }
}

fn tab_button(label: &str) -> gtk::ToggleButton {
    gtk::ToggleButton::builder()
        .label(label)
        .css_classes(["flat", "module-tab"])
        .build()
}

/// Tema e cor de destaque escrevem direto em `org.gnome.desktop.interface`
/// (veja `crate::appearance`): não é preferência do Vega, é a mesma
/// configuração do painel Aparência do GNOME — muda o Shell, o Nautilus e
/// qualquer app libadwaita em execução, não só a janela do Vega.
fn appearance_page() -> gtk::Widget {
    install_swatch_css();

    let unavailable = !crate::appearance::schema_available();

    let theme = adw::ComboRow::builder()
        .title(gettext("Tema"))
        .model(&gtk::StringList::new(&[
            &gettext("Seguir o sistema"),
            &gettext("Claro"),
            &gettext("Escuro"),
        ]))
        .selected(match crate::appearance::current_theme() {
            Theme::System => 0,
            Theme::Light => 1,
            Theme::Dark => 2,
        })
        .sensitive(!unavailable)
        .build();
    let theme_group = adw::PreferencesGroup::builder()
        .title(gettext("Tema"))
        .build();
    theme_group.add(&theme);

    theme.connect_selected_notify(move |row| {
        let theme = match row.selected() {
            1 => Theme::Light,
            2 => Theme::Dark,
            _ => Theme::System,
        };
        crate::appearance::apply_theme(theme);
    });

    let accent_group = adw::PreferencesGroup::builder()
        .title(gettext("Cor de destaque"))
        .description(gettext(
            "Aplica no GNOME inteiro, como no painel Aparência das Configurações.",
        ))
        .build();
    let accent_row = adw::ActionRow::builder()
        .title(gettext("Cor de destaque"))
        .sensitive(!unavailable)
        .build();
    let swatches = gtk::Box::new(gtk::Orientation::Horizontal, 6);
    swatches.set_valign(gtk::Align::Center);

    let current = crate::appearance::current_accent_color().unwrap_or(AccentColor::Blue);
    let mut group_anchor: Option<gtk::ToggleButton> = None;
    for color in AccentColor::ALL {
        let button = accent_swatch(color, group_anchor.as_ref());
        if group_anchor.is_none() {
            group_anchor = Some(button.clone());
        }
        button.set_active(color == current);

        button.connect_toggled(move |button| {
            if !button.is_active() {
                return;
            }
            crate::appearance::apply_accent_color(color);
        });

        swatches.append(&button);
    }
    accent_row.add_suffix(&swatches);
    accent_group.add(&accent_row);

    let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
    if unavailable {
        content.append(
            &gtk::Label::builder()
                .label(gettext(
                    "Este sistema não tem os esquemas do GNOME para aparência; as opções abaixo ficam desativadas.",
                ))
                .xalign(0.0)
                .wrap(true)
                .css_classes(["dim-label"])
                .build(),
        );
    }
    content.append(&theme_group);
    content.append(&accent_group);

    gtk::ScrolledWindow::builder()
        .child(&content)
        .hscrollbar_policy(gtk::PolicyType::Never)
        .build()
        .upcast()
}

fn accent_key(color: AccentColor) -> &'static str {
    match color {
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

fn accent_label(color: AccentColor) -> String {
    match color {
        AccentColor::Blue => gettext("Azul"),
        AccentColor::Teal => gettext("Verde-azulado"),
        AccentColor::Green => gettext("Verde"),
        AccentColor::Yellow => gettext("Amarelo"),
        AccentColor::Orange => gettext("Laranja"),
        AccentColor::Red => gettext("Vermelho"),
        AccentColor::Pink => gettext("Rosa"),
        AccentColor::Purple => gettext("Roxo"),
        AccentColor::Slate => gettext("Ardósia"),
    }
}

fn accent_swatch(color: AccentColor, group: Option<&gtk::ToggleButton>) -> gtk::ToggleButton {
    let button = gtk::ToggleButton::builder()
        .css_classes([
            "flat",
            "circular",
            "vega-accent-swatch",
            &format!("vega-accent-swatch-{}", accent_key(color)),
        ])
        .tooltip_text(accent_label(color))
        .width_request(28)
        .height_request(28)
        .build();
    if let Some(group) = group {
        button.set_group(Some(group));
    }
    button
}

/// Provider de CSS instalado uma vez por processo, definindo a cor sólida de
/// cada botão-amostra do seletor de cor de destaque (`AccentColor::swatch`).
fn install_swatch_css() {
    use std::sync::OnceLock;
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        let mut css = String::from(
            ".vega-accent-swatch { min-width: 0; min-height: 0; padding: 0; }\n\
             .vega-accent-swatch:checked { outline: 2px solid @window_fg_color; outline-offset: 2px; }\n",
        );
        for color in AccentColor::ALL {
            css.push_str(&format!(
                ".vega-accent-swatch-{} {{ background-color: {}; }}\n",
                accent_key(color),
                color.swatch(),
            ));
        }

        let provider = gtk::CssProvider::new();
        provider.load_from_data(&css);
        if let Some(display) = gtk::gdk::Display::default() {
            gtk::style_context_add_provider_for_display(
                &display,
                &provider,
                gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
        }
    });
}
