//! Substitutos manuais dos widgets do libadwaita usados pelo vega-gtk
//! (`AdwActionRow`, `AdwPreferencesGroup`, `AdwWindowTitle`, `AdwDialog`,
//! `AdwAlertDialog`), construídos só com GTK4 puro para o vega-xfce.

use gettextrs::gettext;
use gtk::glib;
use gtk::prelude::*;

/// Substituto de `adw::ActionRow`: uma linha de `gtk::ListBox` com
/// título/subtítulo (interpretados como Pango markup, igual ao original) e
/// caixas de prefixo/sufixo para ícones e botões.
#[derive(Clone)]
pub struct ActionRow {
    pub widget: gtk::ListBoxRow,
    center: gtk::Box,
    prefix_box: gtk::Box,
    suffix_box: gtk::Box,
}

#[derive(Default)]
pub struct ActionRowBuilder {
    title: String,
    subtitle: String,
    activatable: bool,
}

impl ActionRow {
    pub fn builder() -> ActionRowBuilder {
        ActionRowBuilder::default()
    }

    pub fn new() -> Self {
        Self::builder().build()
    }

    pub fn add_prefix(&self, widget: &impl IsA<gtk::Widget>) {
        self.prefix_box.set_visible(true);
        self.prefix_box.append(widget);
    }

    pub fn add_suffix(&self, widget: &impl IsA<gtk::Widget>) {
        self.suffix_box.append(widget);
    }

    /// Substitui título/subtítulo por um widget de conteúdo livre — mesmo
    /// uso que `adw::ActionRow::set_child` tem em `shell.rs`'s `card()`.
    pub fn set_child(&self, widget: &impl IsA<gtk::Widget>) {
        self.center.set_visible(false);
        self.suffix_box.append(widget);
    }
}

impl ActionRowBuilder {
    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = title.into();
        self
    }

    pub fn subtitle(mut self, subtitle: impl Into<String>) -> Self {
        self.subtitle = subtitle.into();
        self
    }

    pub fn activatable(mut self, activatable: bool) -> Self {
        self.activatable = activatable;
        self
    }

    pub fn build(self) -> ActionRow {
        let title_label = gtk::Label::builder()
            .xalign(0.0)
            .use_markup(true)
            .ellipsize(gtk::pango::EllipsizeMode::End)
            .build();
        title_label.set_markup(&self.title);
        let subtitle_label = gtk::Label::builder()
            .xalign(0.0)
            .use_markup(true)
            .ellipsize(gtk::pango::EllipsizeMode::End)
            .css_classes(["dim-label", "caption"])
            .visible(!self.subtitle.is_empty())
            .build();
        subtitle_label.set_markup(&self.subtitle);

        let center = gtk::Box::builder()
            .orientation(gtk::Orientation::Vertical)
            .spacing(2)
            .hexpand(true)
            .valign(gtk::Align::Center)
            .build();
        center.append(&title_label);
        center.append(&subtitle_label);

        let prefix_box = gtk::Box::builder()
            .orientation(gtk::Orientation::Horizontal)
            .spacing(8)
            .valign(gtk::Align::Center)
            .visible(false)
            .build();
        let suffix_box = gtk::Box::builder()
            .orientation(gtk::Orientation::Horizontal)
            .spacing(8)
            .valign(gtk::Align::Center)
            .build();

        let inner = gtk::Box::builder()
            .orientation(gtk::Orientation::Horizontal)
            .spacing(12)
            .margin_top(8)
            .margin_bottom(8)
            .margin_start(12)
            .margin_end(12)
            .build();
        inner.append(&prefix_box);
        inner.append(&center);
        inner.append(&suffix_box);

        let widget = gtk::ListBoxRow::builder()
            .child(&inner)
            .activatable(self.activatable)
            .build();

        ActionRow {
            widget,
            center,
            prefix_box,
            suffix_box,
        }
    }
}

/// Substituto de `adw::PreferencesGroup`: título/descrição opcionais mais um
/// `gtk::ListBox` (classe `.boxed-list`) para as `ActionRow`s.
#[derive(Clone)]
pub struct PreferencesGroup {
    pub widget: gtk::Box,
    list: gtk::ListBox,
}

#[derive(Default)]
pub struct PreferencesGroupBuilder {
    title: String,
    description: String,
}

impl PreferencesGroup {
    pub fn builder() -> PreferencesGroupBuilder {
        PreferencesGroupBuilder::default()
    }

    pub fn add(&self, row: &ActionRow) {
        self.list.append(&row.widget);
    }

    pub fn add_css_class(&self, class: &str) {
        self.widget.add_css_class(class);
    }
}

impl PreferencesGroupBuilder {
    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = title.into();
        self
    }

    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = description.into();
        self
    }

    pub fn build(self) -> PreferencesGroup {
        let widget = gtk::Box::builder()
            .orientation(gtk::Orientation::Vertical)
            .spacing(6)
            .build();
        if !self.title.is_empty() {
            widget.append(
                &gtk::Label::builder()
                    .label(&self.title)
                    .xalign(0.0)
                    .css_classes(["title-4"])
                    .build(),
            );
        }
        if !self.description.is_empty() {
            widget.append(
                &gtk::Label::builder()
                    .label(&self.description)
                    .xalign(0.0)
                    .wrap(true)
                    .css_classes(["dim-label", "caption"])
                    .build(),
            );
        }
        let list = gtk::ListBox::builder()
            .selection_mode(gtk::SelectionMode::None)
            .css_classes(["boxed-list"])
            .build();
        widget.append(&list);
        PreferencesGroup { widget, list }
    }
}

/// Substituto de `adw::WindowTitle`: título + subtítulo empilhados,
/// centralizados, para usar em `gtk::HeaderBar::title_widget`.
pub fn window_title(title: &str, subtitle: &str) -> gtk::Box {
    let container = gtk::Box::builder()
        .orientation(gtk::Orientation::Vertical)
        .valign(gtk::Align::Center)
        .build();
    container.append(
        &gtk::Label::builder()
            .label(title)
            .css_classes(["title"])
            .single_line_mode(true)
            .ellipsize(gtk::pango::EllipsizeMode::End)
            .build(),
    );
    if !subtitle.is_empty() {
        container.append(
            &gtk::Label::builder()
                .label(subtitle)
                .css_classes(["subtitle", "dim-label"])
                .single_line_mode(true)
                .ellipsize(gtk::pango::EllipsizeMode::End)
                .build(),
        );
    }
    container
}

/// Substituto simples de `adw::Dialog`: uma `gtk::Window` modal com
/// cabeçalho e largura/altura de conteúdo fixas.
#[derive(Clone)]
pub struct Dialog {
    pub window: gtk::Window,
}

pub struct DialogBuilder {
    child: Option<gtk::Widget>,
    width: i32,
    height: i32,
}

impl Dialog {
    pub fn builder() -> DialogBuilder {
        DialogBuilder {
            child: None,
            width: -1,
            height: -1,
        }
    }

    pub fn present(&self, parent: Option<&impl IsA<gtk::Window>>) {
        if let Some(parent) = parent {
            self.window.set_transient_for(Some(parent));
        }
        self.window.present();
    }

    pub fn close(&self) {
        self.window.close();
    }

    pub fn is_visible(&self) -> bool {
        self.window.is_visible()
    }
}

impl DialogBuilder {
    pub fn child(mut self, widget: &impl IsA<gtk::Widget>) -> Self {
        self.child = Some(widget.clone().upcast());
        self
    }

    pub fn content_width(mut self, width: i32) -> Self {
        self.width = width;
        self
    }

    pub fn content_height(mut self, height: i32) -> Self {
        self.height = height;
        self
    }

    pub fn build(self) -> Dialog {
        let window = gtk::Window::builder()
            .modal(true)
            .default_width(self.width)
            .default_height(self.height)
            .build();
        if let Some(child) = &self.child {
            window.set_child(Some(child));
        }
        Dialog { window }
    }
}

/// Substituto de `adw::AlertDialog::choose_future`: usa o `gtk::AlertDialog`
/// nativo do GTK4 4.10+ (não é do libadwaita), com API assíncrona
/// equivalente.
pub async fn confirm(
    parent: &gtk::ApplicationWindow,
    title: &str,
    message: &str,
    confirm_label: &str,
) -> bool {
    let dialog = gtk::AlertDialog::builder()
        .modal(true)
        .message(title)
        .detail(message)
        .buttons([gettext("Cancelar"), confirm_label.to_string()])
        .cancel_button(0)
        .default_button(0)
        .build();
    matches!(dialog.choose_future(Some(parent)).await, Ok(1))
}

/// Variante de `confirm()` com um widget extra embutido (usada na revisão de
/// PKGBUILD do AUR, onde o `adw::AlertDialog` original usa
/// `set_extra_child`). O `gtk::AlertDialog` nativo não aceita conteúdo
/// extra, então aqui usamos nosso próprio `Dialog`/`gtk::Window`.
pub async fn confirm_with_extra(
    parent: &gtk::ApplicationWindow,
    title: &str,
    message: &str,
    extra: &impl IsA<gtk::Widget>,
    confirm_label: &str,
) -> bool {
    let (tx, rx) = async_channel::bounded::<bool>(1);

    let body = gtk::Box::builder()
        .orientation(gtk::Orientation::Vertical)
        .spacing(12)
        .margin_top(16)
        .margin_bottom(16)
        .margin_start(16)
        .margin_end(16)
        .build();
    body.append(
        &gtk::Label::builder()
            .label(title)
            .xalign(0.0)
            .css_classes(["title-3"])
            .build(),
    );
    body.append(
        &gtk::Label::builder()
            .label(message)
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build(),
    );
    body.append(extra);

    let buttons = gtk::Box::builder()
        .orientation(gtk::Orientation::Horizontal)
        .spacing(8)
        .halign(gtk::Align::End)
        .build();
    let cancel = gtk::Button::builder().label(gettext("Cancelar")).build();
    let confirm = gtk::Button::builder()
        .label(confirm_label)
        .css_classes(["suggested-action"])
        .build();
    buttons.append(&cancel);
    buttons.append(&confirm);
    body.append(&buttons);

    let dialog = Dialog::builder()
        .child(&body)
        .content_width(680)
        .content_height(480)
        .build();

    let confirm_tx = tx.clone();
    let confirm_dialog = dialog.clone();
    confirm.connect_clicked(move |_| {
        let _ = confirm_tx.try_send(true);
        confirm_dialog.close();
    });
    let cancel_tx = tx.clone();
    let cancel_dialog = dialog.clone();
    cancel.connect_clicked(move |_| {
        let _ = cancel_tx.try_send(false);
        cancel_dialog.close();
    });
    // Fechar pela decoração da janela (X) também deve destravar quem espera
    // a resposta, senão `rx.recv()` trava para sempre.
    dialog.window.connect_close_request(move |_| {
        let _ = tx.try_send(false);
        glib::Propagation::Proceed
    });

    dialog.present(Some(parent));
    rx.recv().await.unwrap_or(false)
}
