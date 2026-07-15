use std::{cell::RefCell, rc::Rc};

use adw::prelude::*;

use crate::dbus::StorageVolume;

#[derive(Clone)]
pub struct StoragePage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub volumes: gtk::ListBox,
    pub action: gtk::Button,
    items: Rc<RefCell<Vec<StorageVolume>>>,
}

impl StoragePage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label("Carregando volumes…")
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();
        let volumes = gtk::ListBox::builder()
            .selection_mode(gtk::SelectionMode::Single)
            .css_classes(["boxed-list"])
            .build();
        volumes.add_css_class("storage-volumes");
        let action = gtk::Button::builder()
            .label("Montar")
            .halign(gtk::Align::Start)
            .sensitive(false)
            .build();
        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.add_css_class("content-page");
        content.add_css_class("compact-page");
        content.append(
            &gtk::Label::builder()
                .label("Armazenamento")
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(
            &gtk::Label::builder()
                .label("Volumes e pontos de montagem detectados pelo vegad")
                .xalign(0.0)
                .css_classes(["dim-label"])
                .build(),
        );
        content.append(&status);
        content.append(&volumes);
        content.append(&action);
        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();
        let page = Self {
            root,
            status,
            volumes,
            action,
            items: Rc::new(RefCell::new(Vec::new())),
        };
        let selection_page = page.clone();
        page.volumes
            .connect_row_selected(move |_, _| selection_page.update_action());
        page
    }

    pub fn show(&self, volumes: Vec<StorageVolume>) {
        while let Some(child) = self.volumes.first_child() {
            self.volumes.remove(&child);
        }
        self.status.set_label(if volumes.is_empty() {
            "Nenhum volume detectado"
        } else {
            "Selecione um volume para montar ou desmontar"
        });
        for volume in &volumes {
            let title = if volume.model.is_empty() {
                format!("{} • {}", volume.name, volume.path)
            } else {
                format!("{} • {}", volume.model, volume.path)
            };
            let mount = if volume.mountpoint.is_empty() {
                "Não montado".into()
            } else {
                format!("Montado em {}", volume.mountpoint)
            };
            let usage = if volume.used.is_empty() {
                volume.size.clone()
            } else {
                format!(
                    "{} usados de {} • {}%",
                    volume.used, volume.size, volume.use_percent
                )
            };
            let subtitle = format!(
                "{} • {} • {} • {}",
                volume.kind,
                value(&volume.fs_type),
                usage,
                mount
            );
            let row = adw::ActionRow::builder()
                .title(gtk::glib::markup_escape_text(&title))
                .subtitle(gtk::glib::markup_escape_text(&subtitle))
                .activatable(true)
                .build();
            if volume.removable {
                row.add_suffix(&gtk::Label::new(Some("Removível")));
            }
            self.volumes.append(&row);
        }
        *self.items.borrow_mut() = volumes;
        self.update_action();
    }

    pub fn selected(&self) -> Option<StorageVolume> {
        let index = self.volumes.selected_row()?.index() as usize;
        self.items.borrow().get(index).cloned()
    }

    fn update_action(&self) {
        let Some(volume) = self.selected() else {
            self.action.set_sensitive(false);
            return;
        };
        self.action.set_label(if volume.can_unmount {
            "Desmontar"
        } else {
            "Montar"
        });
        self.action
            .set_sensitive(volume.can_mount || volume.can_unmount);
    }
}

fn value(text: &str) -> &str {
    if text.is_empty() {
        "sem filesystem"
    } else {
        text
    }
}
