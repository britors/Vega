use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use adw::prelude::*;
use gettextrs::gettext;

use crate::dock::TopBarSettings;

type ChangeHandler = Rc<dyn Fn(TopBarSettings)>;

#[derive(Clone)]
pub struct TopBarPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub height: gtk::SpinButton,
    pub show_clock: gtk::Switch,
    pub show_indicators: gtk::Switch,
    suppress: Rc<Cell<bool>>,
    change_handlers: Rc<RefCell<Vec<ChangeHandler>>>,
}

impl TopBarPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label(gettext("Carregando configuração…"))
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();

        let height = gtk::SpinButton::with_range(24.0, 64.0, 1.0);
        let show_clock = switch();
        let show_indicators = switch();

        let appearance_group = adw::PreferencesGroup::builder()
            .title(gettext("Barra superior"))
            .build();
        appearance_group.add(&property_row(&gettext("Tamanho"), &height));
        appearance_group.add(&property_row(&gettext("Mostrar relógio"), &show_clock));
        appearance_group.add(&property_row(
            &gettext("Mostrar itens da direita"),
            &show_indicators,
        ));

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.append(&status);
        content.append(&appearance_group);

        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();

        let page = Self {
            root,
            status,
            height,
            show_clock,
            show_indicators,
            suppress: Rc::new(Cell::new(false)),
            change_handlers: Rc::new(RefCell::new(Vec::new())),
        };
        page.wire_changed_signals();
        page
    }

    pub fn connect_changed(&self, handler: impl Fn(TopBarSettings) + 'static) {
        self.change_handlers.borrow_mut().push(Rc::new(handler));
    }

    pub fn set_controls_sensitive(&self, sensitive: bool) {
        self.height.set_sensitive(sensitive);
        self.show_clock.set_sensitive(sensitive);
        self.show_indicators.set_sensitive(sensitive);
    }

    fn emit_changed(&self) {
        if self.suppress.get() {
            return;
        }
        let settings = self.selected();
        for handler in self.change_handlers.borrow().iter() {
            handler(settings.clone());
        }
    }

    fn wire_changed_signals(&self) {
        let page = self.clone();
        self.height
            .connect_value_notify(move |_| page.emit_changed());
        let page = self.clone();
        self.show_clock
            .connect_active_notify(move |_| page.emit_changed());
        let page = self.clone();
        self.show_indicators
            .connect_active_notify(move |_| page.emit_changed());
    }

    pub fn show(&self, settings: &TopBarSettings) {
        self.suppress.set(true);
        self.height.set_value(f64::from(settings.height));
        self.show_clock.set_active(settings.show_clock);
        self.show_indicators.set_active(settings.show_indicators);
        self.suppress.set(false);
        self.set_controls_sensitive(true);
        self.status
            .set_label(&gettext("Configuração atual carregada"));
    }

    pub fn selected(&self) -> TopBarSettings {
        TopBarSettings {
            height: self.height.value_as_int().max(0) as u32,
            show_clock: self.show_clock.is_active(),
            show_indicators: self.show_indicators.is_active(),
        }
    }
}

impl Default for TopBarPage {
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
