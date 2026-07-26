use adw::prelude::*;
use gettextrs::gettext;

use crate::dock::DockSettings;

const POSITIONS: &[&str] = &["bottom", "top", "left", "right"];
const HIDE_MODES: &[&str] = &["intelligent", "autohide", "always"];

fn position_label(id: &str) -> String {
    match id {
        "top" => gettext("Superior"),
        "left" => gettext("Esquerda"),
        "right" => gettext("Direita"),
        _ => gettext("Inferior"),
    }
}

fn hide_mode_label(id: &str) -> String {
    match id {
        "autohide" => gettext("Auto hide"),
        "always" => gettext("Sempre ativo"),
        _ => gettext("Ocultação inteligente"),
    }
}

fn id_dropdown(ids: &[&str], labels: impl Fn(&str) -> String, current: &str) -> gtk::DropDown {
    let strings: Vec<String> = ids.iter().map(|id| labels(id)).collect();
    let model = gtk::StringList::new(&strings.iter().map(String::as_str).collect::<Vec<_>>());
    let dropdown = gtk::DropDown::builder()
        .model(&model)
        .valign(gtk::Align::Center)
        .build();
    let index = ids.iter().position(|&id| id == current).unwrap_or(0);
    dropdown.set_selected(index as u32);
    dropdown
}

fn dropdown_selected<'a>(dropdown: &gtk::DropDown, ids: &'a [&str]) -> &'a str {
    ids.get(dropdown.selected() as usize)
        .copied()
        .unwrap_or(ids[0])
}

#[derive(Clone)]
pub struct DockPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub position: gtk::DropDown,
    pub hide_mode: gtk::DropDown,
    pub icon_size: gtk::SpinButton,
    pub edge_margin: gtk::SpinButton,
    pub hide_delay: gtk::SpinButton,
    pub animation: gtk::Switch,
    pub show_running: gtk::Switch,
    pub show_trash: gtk::Switch,
    pub show_apps_button: gtk::Switch,
    pub fullscreen_hide: gtk::Switch,
    pub apply: gtk::Button,
}

impl DockPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label(gettext("Carregando configuração…"))
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();

        let position = id_dropdown(POSITIONS, position_label, "bottom");
        let hide_mode = id_dropdown(HIDE_MODES, hide_mode_label, "intelligent");
        let icon_size = gtk::SpinButton::with_range(24.0, 96.0, 1.0);
        let edge_margin = gtk::SpinButton::with_range(0.0, 48.0, 1.0);
        let hide_delay = gtk::SpinButton::with_range(100.0, 3000.0, 100.0);
        let animation = switch();
        let show_running = switch();
        let show_trash = switch();
        let show_apps_button = switch();
        let fullscreen_hide = switch();

        let appearance_group = adw::PreferencesGroup::builder()
            .title(gettext("Aparência"))
            .build();
        appearance_group.add(&property_row(&gettext("Posição"), &position));
        appearance_group.add(&property_row(&gettext("Tamanho dos ícones"), &icon_size));
        appearance_group.add(&property_row(&gettext("Margem da borda"), &edge_margin));
        appearance_group.add(&property_row(&gettext("Animações"), &animation));

        let behavior_group = adw::PreferencesGroup::builder()
            .title(gettext("Comportamento"))
            .build();
        behavior_group.add(&property_row(&gettext("Visibilidade do dock"), &hide_mode));
        behavior_group.add(&property_row(
            &gettext("Atraso para ocultar (ms)"),
            &hide_delay,
        ));
        behavior_group.add(&property_row(
            &gettext("Ocultar em tela cheia"),
            &fullscreen_hide,
        ));

        let content_group = adw::PreferencesGroup::builder()
            .title(gettext("Elementos exibidos"))
            .build();
        content_group.add(&property_row(
            &gettext("Aplicativos em execução"),
            &show_running,
        ));
        content_group.add(&property_row(&gettext("Lixeira"), &show_trash));
        content_group.add(&property_row(
            &gettext("Botão de aplicativos"),
            &show_apps_button,
        ));

        let apply = gtk::Button::builder()
            .label(gettext("Aplicar"))
            .halign(gtk::Align::End)
            .css_classes(["suggested-action"])
            .build();

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.append(&status);
        content.append(&appearance_group);
        content.append(&behavior_group);
        content.append(&content_group);
        content.append(&apply);

        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();

        Self {
            root,
            status,
            position,
            hide_mode,
            icon_size,
            edge_margin,
            hide_delay,
            animation,
            show_running,
            show_trash,
            show_apps_button,
            fullscreen_hide,
            apply,
        }
    }

    pub fn show(&self, settings: &DockSettings) {
        self.position.set_selected(
            POSITIONS
                .iter()
                .position(|&id| id == settings.position)
                .unwrap_or(0) as u32,
        );
        self.hide_mode.set_selected(
            HIDE_MODES
                .iter()
                .position(|&id| id == settings.hide_mode)
                .unwrap_or(0) as u32,
        );
        self.icon_size.set_value(f64::from(settings.icon_size));
        self.edge_margin.set_value(f64::from(settings.edge_margin));
        self.hide_delay.set_value(f64::from(settings.hide_delay_ms));
        self.animation.set_active(settings.animation);
        self.show_running.set_active(settings.show_running);
        self.show_trash.set_active(settings.show_trash);
        self.show_apps_button.set_active(settings.show_apps_button);
        self.fullscreen_hide.set_active(settings.fullscreen_hide);
        self.status
            .set_label(&gettext("Configuração atual carregada"));
    }

    pub fn selected(&self) -> DockSettings {
        DockSettings {
            position: dropdown_selected(&self.position, POSITIONS).to_string(),
            hide_mode: dropdown_selected(&self.hide_mode, HIDE_MODES).to_string(),
            hide_delay_ms: self.hide_delay.value_as_int().max(0) as u32,
            icon_size: self.icon_size.value_as_int().max(0) as u32,
            edge_margin: self.edge_margin.value_as_int().max(0) as u32,
            animation: self.animation.is_active(),
            show_running: self.show_running.is_active(),
            show_trash: self.show_trash.is_active(),
            show_apps_button: self.show_apps_button.is_active(),
            fullscreen_hide: self.fullscreen_hide.is_active(),
        }
    }
}

impl Default for DockPage {
    fn default() -> Self {
        Self::new()
    }
}

fn switch() -> gtk::Switch {
    gtk::Switch::builder()
        .halign(gtk::Align::End)
        .valign(gtk::Align::Center)
        .build()
}

fn property_row(title: &str, widget: &impl IsA<gtk::Widget>) -> adw::ActionRow {
    let row = adw::ActionRow::builder().title(title).build();
    row.add_suffix(widget);
    row
}
