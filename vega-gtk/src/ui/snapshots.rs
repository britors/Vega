use std::{cell::RefCell, rc::Rc};

use adw::prelude::*;
use gettextrs::gettext;

use crate::dbus::Snapshot;

#[derive(Clone)]
pub struct SnapshotsPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub list: gtk::ListBox,
    pub create: gtk::Button,
    pub compare: gtk::Button,
    pub rollback: gtk::Button,
    pub delete: gtk::Button,
    pub retention: gtk::SpinButton,
    pub apply_retention: gtk::Button,
    pub comparison: gtk::Label,
    items: Rc<RefCell<Vec<Snapshot>>>,
}

impl SnapshotsPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label(gettext("Verificando suporte a snapshots…"))
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();
        let list = gtk::ListBox::builder()
            .selection_mode(gtk::SelectionMode::Single)
            .css_classes(["boxed-list"])
            .build();
        list.add_css_class("snapshot-selection");
        let create = gtk::Button::builder()
            .label(gettext("Criar ponto"))
            .css_classes(["suggested-action"])
            .build();
        let compare = gtk::Button::with_label(&gettext("Comparar pacotes"));
        let rollback = gtk::Button::with_label(&gettext("Aplicar"));
        rollback.add_css_class("suggested-action");
        let delete = gtk::Button::with_label(&gettext("Excluir"));
        delete.add_css_class("destructive-action");
        for button in [&compare, &rollback, &delete] {
            button.set_sensitive(false);
        }
        let actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        actions.append(&create);
        actions.append(&compare);
        actions.append(&rollback);
        actions.append(&delete);
        let comparison = gtk::Label::builder()
            .label(gettext(
                "Selecione um ponto para comparar os pacotes com o estado atual.",
            ))
            .xalign(0.0)
            .wrap(true)
            .selectable(true)
            .css_classes(["snapshot-paths"])
            .build();
        let retention = gtk::SpinButton::with_range(1.0, 100.0, 1.0);
        retention.set_value(10.0);
        let apply_retention = gtk::Button::with_label(&gettext("Aplicar retenção"));
        let retention_row = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        retention_row.add_css_class("card");
        retention_row.append(
            &gtk::Label::builder()
                .label(gettext("Manter os snapshots mais recentes"))
                .xalign(0.0)
                .hexpand(true)
                .build(),
        );
        retention_row.append(&retention);
        retention_row.append(&apply_retention);

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.add_css_class("content-page");
        content.append(&status);
        content.append(&actions);
        content.append(&list);
        content.append(&comparison);
        content.append(&retention_row);
        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();
        let page = Self {
            root,
            status,
            list,
            create,
            compare,
            rollback,
            delete,
            retention,
            apply_retention,
            comparison,
            items: Rc::new(RefCell::new(Vec::new())),
        };
        let compare = page.compare.clone();
        let rollback = page.rollback.clone();
        let delete = page.delete.clone();
        page.list.connect_row_selected(move |_, row| {
            let selected = row.is_some();
            compare.set_sensitive(selected);
            rollback.set_sensitive(selected);
            delete.set_sensitive(selected);
        });
        page
    }

    pub fn set_available(&self, available: bool) {
        self.create.set_sensitive(available);
        if !available {
            self.status
                .set_label(&gettext("Snapshots não são suportados neste sistema."));
        }
    }

    pub fn show_snapshots(&self, snapshots: Vec<Snapshot>) {
        while let Some(child) = self.list.first_child() {
            self.list.remove(&child);
        }
        self.status.set_label(&if snapshots.is_empty() {
            gettext("Nenhum ponto de restauração encontrado")
        } else {
            gettext("Selecione um ponto para comparar, aplicar ou excluir")
        });
        for snapshot in &snapshots {
            let date = format_timestamp(snapshot.timestamp);
            let title = if snapshot.description.is_empty() {
                gettext("Snapshot #{id}").replace("{id}", &snapshot.id.to_string())
            } else {
                snapshot.description.clone()
            };
            let subtitle = format!("#{0} • {date} • {1}", snapshot.id, snapshot.trigger);
            self.list.append(
                &adw::ActionRow::builder()
                    .title(gtk::glib::markup_escape_text(&title))
                    .subtitle(gtk::glib::markup_escape_text(&subtitle))
                    .activatable(true)
                    .build(),
            );
        }
        *self.items.borrow_mut() = snapshots;
    }

    pub fn selected_snapshot(&self) -> Option<Snapshot> {
        let index = self.list.selected_row()?.index() as usize;
        self.items.borrow().get(index).cloned()
    }

    pub fn show_comparison(&self, changes: &[String]) {
        let text = if changes.is_empty() {
            gettext("Nenhuma diferença de pacotes em relação ao estado atual.")
        } else {
            changes.join("\n")
        };
        self.comparison.set_label(&text);
    }
}

fn format_timestamp(timestamp: i64) -> String {
    gtk::glib::DateTime::from_unix_local(timestamp)
        .and_then(|date| date.format("%d/%m/%Y %H:%M"))
        .map(|value| value.to_string())
        .unwrap_or_else(|_| timestamp.to_string())
}
