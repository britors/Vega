use std::{cell::RefCell, rc::Rc};

use adw::prelude::*;
use gettextrs::gettext;

use crate::dbus::UserInfo;

#[derive(Clone)]
pub struct UsersPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub username: gtk::Entry,
    pub admin: gtk::CheckButton,
    pub create: gtk::Button,
    pub list: gtk::ListBox,
    pub change_admin: gtk::Button,
    pub remove: gtk::Button,
    items: Rc<RefCell<Vec<UserInfo>>>,
    row_actions: Rc<RefCell<Vec<(gtk::Button, gtk::Button, bool)>>>,
}

impl UsersPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label(gettext("Carregando usuários…"))
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();
        let username = gtk::Entry::builder()
            .placeholder_text(gettext("nome de usuário"))
            .hexpand(true)
            .build();
        let admin = gtk::CheckButton::builder()
            .label(gettext("Administrador"))
            .active(true)
            .build();
        let create = gtk::Button::builder()
            .label(gettext("Criar usuário"))
            .sensitive(false)
            .css_classes(["suggested-action"])
            .build();
        let form_row = gtk::Box::new(gtk::Orientation::Horizontal, 10);
        form_row.append(&username);
        form_row.append(&admin);
        form_row.append(&create);
        let form = gtk::Box::new(gtk::Orientation::Vertical, 8);
        form.add_css_class("card");
        form.append(
            &gtk::Label::builder()
                .label(gettext("Novo usuário"))
                .xalign(0.0)
                .css_classes(["title-2"])
                .build(),
        );
        form.append(&form_row);

        let list = gtk::ListBox::builder()
            .selection_mode(gtk::SelectionMode::Single)
            .css_classes(["boxed-list"])
            .build();
        let change_admin = action(&gettext("Alterar administração"));
        let remove = gtk::Button::builder()
            .label(gettext("Remover"))
            .sensitive(false)
            .css_classes(["destructive-action"])
            .build();

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.add_css_class("content-page");
        content.add_css_class("compact-page");
        content.append(
            &gtk::Label::builder()
                .label(gettext("Contas e Usuários"))
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(
            &gtk::Label::builder()
                .label(gettext("Criação, remoção e controle de administração"))
                .xalign(0.0)
                .css_classes(["dim-label"])
                .build(),
        );
        content.append(&status);
        content.append(&form);
        content.append(
            &gtk::Label::builder()
                .label(gettext("Usuários"))
                .xalign(0.0)
                .css_classes(["title-2"])
                .build(),
        );
        content.append(&list);
        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();
        let page = Self {
            root,
            status,
            username,
            admin,
            create,
            list,
            change_admin,
            remove,
            items: Rc::new(RefCell::new(Vec::new())),
            row_actions: Rc::new(RefCell::new(Vec::new())),
        };
        let entry_page = page.clone();
        page.username.connect_changed(move |entry| {
            entry_page
                .create
                .set_sensitive(valid_username(entry.text().as_str()));
        });
        let selection_page = page.clone();
        page.list
            .connect_row_selected(move |_, _| selection_page.update_actions());
        page
    }

    pub fn show(&self, items: Vec<UserInfo>) {
        self.row_actions.borrow_mut().clear();
        while let Some(child) = self.list.first_child() {
            self.list.remove(&child);
        }
        if items.is_empty() {
            self.list.set_selection_mode(gtk::SelectionMode::None);
            self.list.append(
                &adw::ActionRow::builder()
                    .title(gettext("Nenhum usuário listado"))
                    .subtitle(gettext("Ainda não há contas cadastradas."))
                    .build(),
            );
        } else {
            self.list.set_selection_mode(gtk::SelectionMode::Single);
            for user in &items {
                let row = adw::ActionRow::builder()
                    .title(gtk::glib::markup_escape_text(&user.username))
                    .subtitle(if user.is_admin {
                        gettext("Administrador")
                    } else {
                        gettext("Usuário comum")
                    })
                    .activatable(true)
                    .build();
                row.add_prefix(&gtk::Image::from_icon_name("avatar-default-symbolic"));
                let mutable = user.username != "root";
                let admin_button = gtk::Button::builder()
                    .label(if user.is_admin {
                        gettext("Remover admin")
                    } else {
                        gettext("Tornar admin")
                    })
                    .sensitive(mutable)
                    .valign(gtk::Align::Center)
                    .css_classes(["compact"])
                    .build();
                let remove_button = gtk::Button::builder()
                    .label(gettext("Remover"))
                    .sensitive(mutable)
                    .valign(gtk::Align::Center)
                    .css_classes(["destructive-action", "compact"])
                    .build();
                row.add_suffix(&admin_button);
                row.add_suffix(&remove_button);
                self.list.append(&row);
                let admin_list = self.list.clone();
                let admin_row = row.clone();
                let admin_action = self.change_admin.clone();
                admin_button.connect_clicked(move |_| {
                    admin_list.select_row(Some(&admin_row));
                    admin_action.emit_clicked();
                });
                let remove_list = self.list.clone();
                let remove_row = row.clone();
                let remove_action = self.remove.clone();
                remove_button.connect_clicked(move |_| {
                    remove_list.select_row(Some(&remove_row));
                    remove_action.emit_clicked();
                });
                self.row_actions
                    .borrow_mut()
                    .push((admin_button, remove_button, mutable));
            }
        }
        self.status
            .set_label(&gettext("{count} usuário(s)").replace("{count}", &items.len().to_string()));
        *self.items.borrow_mut() = items;
        self.update_actions();
    }

    pub fn selected(&self) -> Option<UserInfo> {
        self.items
            .borrow()
            .get(self.list.selected_row()?.index() as usize)
            .cloned()
    }

    pub fn set_busy(&self, busy: bool) {
        self.username.set_sensitive(!busy);
        self.admin.set_sensitive(!busy);
        self.create
            .set_sensitive(!busy && valid_username(self.username.text().as_str()));
        for (admin, remove, mutable) in self.row_actions.borrow().iter() {
            admin.set_sensitive(!busy && *mutable);
            remove.set_sensitive(!busy && *mutable);
        }
        if busy {
            self.change_admin.set_sensitive(false);
            self.remove.set_sensitive(false);
        } else {
            self.update_actions();
        }
    }

    fn update_actions(&self) {
        let selected = self.selected();
        let mutable = selected
            .as_ref()
            .is_some_and(|user| user.username != "root");
        self.change_admin.set_sensitive(mutable);
        self.remove.set_sensitive(mutable);
        if let Some(user) = selected {
            self.change_admin.set_label(&if user.is_admin {
                gettext("Remover admin")
            } else {
                gettext("Tornar admin")
            });
        }
    }
}

fn action(label: &str) -> gtk::Button {
    gtk::Button::builder().label(label).sensitive(false).build()
}

fn valid_username(value: &str) -> bool {
    let value = value.trim();
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_lowercase() || first == '_')
        && chars.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '_' | '-')
        })
}

#[cfg(test)]
mod tests {
    use super::valid_username;

    #[test]
    fn username_validation_matches_backend_rules_for_regular_accounts() {
        for valid in ["rodrigo", "user_2", "dev-user"] {
            assert!(valid_username(valid));
        }
        for invalid in ["", "User", "2user", "user name", "user!"] {
            assert!(!valid_username(invalid));
        }
    }
}
