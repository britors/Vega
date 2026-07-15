use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    rc::Rc,
};

use adw::prelude::*;

use crate::dbus::PackageRef;

type SelectionHandlers = Rc<RefCell<Vec<Rc<dyn Fn()>>>>;

#[derive(Clone, Debug)]
struct PackageGroup {
    packages: Vec<PackageRef>,
    selected: usize,
}

impl PackageGroup {
    fn selected(&self) -> Option<&PackageRef> {
        self.packages.get(self.selected)
    }
}

#[derive(Clone)]
pub struct SoftwarePage {
    pub root: gtk::Widget,
    pub query: gtk::SearchEntry,
    pub search: gtk::Button,
    pub status: gtk::Label,
    pub results: gtk::ListBox,
    pub cards: gtk::FlowBox,
    pub detail_title: gtk::Label,
    pub detail_body: gtk::Label,
    pub action: gtk::Button,
    pub detail_dialog: adw::Dialog,
    pub search_tab: gtk::ToggleButton,
    pub installed_tab: gtk::ToggleButton,
    pub updates_tab: gtk::ToggleButton,
    pub repositories_tab: gtk::ToggleButton,
    pub search_controls: gtk::Box,
    pub results_area: gtk::Box,
    pub repository_panel: gtk::Box,
    pub repository_dropdown: gtk::DropDown,
    pub repository_enable: gtk::Button,
    pub repository_disable: gtk::Button,
    pub optimize_mirrors: gtk::Button,
    pub global_action: gtk::Button,
    pub transaction_panel: gtk::Box,
    pub transaction_label: gtk::Label,
    pub transaction_progress: gtk::ProgressBar,
    package_groups: Rc<RefCell<Vec<PackageGroup>>>,
    selected_group: Rc<Cell<Option<usize>>>,
    selection_handlers: SelectionHandlers,
}

impl SoftwarePage {
    pub fn new() -> Self {
        let query = gtk::SearchEntry::builder()
            .placeholder_text("Buscar aplicativos e pacotes")
            .hexpand(true)
            .build();
        let search = gtk::Button::builder()
            .label("Buscar")
            .css_classes(["suggested-action"])
            .build();
        let controls = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        controls.append(&query);
        controls.append(&search);

        let search_tab = tab_button("Buscar");
        let installed_tab = tab_button("Instalados");
        let updates_tab = tab_button("Atualizações");
        let repositories_tab = tab_button("Repositórios");
        installed_tab.set_group(Some(&search_tab));
        updates_tab.set_group(Some(&search_tab));
        repositories_tab.set_group(Some(&search_tab));
        search_tab.set_active(true);
        let tabs = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        tabs.add_css_class("module-tabs");
        tabs.append(&search_tab);
        tabs.append(&installed_tab);
        tabs.append(&updates_tab);
        tabs.append(&repositories_tab);
        let global_action = gtk::Button::builder()
            .label("Limpar cache")
            .halign(gtk::Align::End)
            .hexpand(true)
            .build();
        let list_view = gtk::ToggleButton::builder()
            .icon_name("view-list-symbolic")
            .tooltip_text("Visualização em lista")
            .css_classes(["flat", "view-switch"])
            .active(true)
            .build();
        let card_view = gtk::ToggleButton::builder()
            .icon_name("view-grid-symbolic")
            .tooltip_text("Visualização em cartões")
            .css_classes(["flat", "view-switch"])
            .build();
        card_view.set_group(Some(&list_view));
        tabs.append(&list_view);
        tabs.append(&card_view);
        tabs.append(&global_action);
        let transaction_label = gtk::Label::builder()
            .label("Preparando transação…")
            .xalign(0.0)
            .wrap(true)
            .build();
        let transaction_progress = gtk::ProgressBar::builder()
            .show_text(true)
            .fraction(0.0)
            .build();
        let transaction_panel = gtk::Box::new(gtk::Orientation::Vertical, 8);
        transaction_panel.add_css_class("card");
        transaction_panel.set_visible(false);
        transaction_panel.append(&transaction_label);
        transaction_panel.append(&transaction_progress);

        let status = gtk::Label::builder()
            .label("Digite ao menos dois caracteres para buscar")
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();
        let results = gtk::ListBox::builder()
            .selection_mode(gtk::SelectionMode::Single)
            .hexpand(true)
            .css_classes(["boxed-list"])
            .build();
        results.add_css_class("software-results");
        let cards = gtk::FlowBox::builder()
            .column_spacing(6)
            .row_spacing(6)
            .min_children_per_line(2)
            .max_children_per_line(4)
            .selection_mode(gtk::SelectionMode::Single)
            .homogeneous(true)
            .build();
        cards.add_css_class("software-cards");
        let result_stack = gtk::Stack::builder()
            .transition_type(gtk::StackTransitionType::Crossfade)
            .build();
        result_stack.add_named(&results, Some("list"));
        result_stack.add_named(&cards, Some("cards"));
        result_stack.set_visible_child_name("list");
        let results_area = gtk::Box::new(gtk::Orientation::Vertical, 12);
        results_area.append(&status);
        results_area.append(&result_stack);

        let repository_dropdown = gtk::DropDown::from_strings(&[]);
        repository_dropdown.set_hexpand(true);
        let repository_enable = gtk::Button::with_label("Ativar");
        let repository_disable = gtk::Button::with_label("Desativar");
        let repository_actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        repository_actions.append(&repository_dropdown);
        repository_actions.append(&repository_enable);
        repository_actions.append(&repository_disable);
        let optimize_mirrors = gtk::Button::builder()
            .label("Otimizar mirrors")
            .halign(gtk::Align::Start)
            .build();
        let repository_panel = gtk::Box::new(gtk::Orientation::Vertical, 12);
        repository_panel.add_css_class("card");
        repository_panel.set_visible(false);
        repository_panel.append(
            &gtk::Label::builder()
                .label("Repositórios do sistema")
                .xalign(0.0)
                .css_classes(["title-3"])
                .build(),
        );
        repository_panel.append(
            &gtk::Label::builder()
                .label("Selecione um repositório para ativar ou desativar. O estado será alterado pelo gerenciador de pacotes da distribuição.")
                .xalign(0.0)
                .wrap(true)
                .css_classes(["dim-label"])
                .build(),
        );
        repository_panel.append(&repository_actions);
        repository_panel.append(&optimize_mirrors);
        let list_stack = result_stack.clone();
        list_view.connect_clicked(move |button| {
            if button.is_active() {
                list_stack.set_visible_child_name("list");
            }
        });
        let card_stack = result_stack.clone();
        card_view.connect_clicked(move |button| {
            if button.is_active() {
                card_stack.set_visible_child_name("cards");
            }
        });
        let detail_title = gtk::Label::builder()
            .label("Selecione um pacote")
            .xalign(0.0)
            .css_classes(["title-3"])
            .build();
        let detail_body = gtk::Label::builder()
            .label("Os detalhes e a ação disponível aparecerão aqui.")
            .xalign(0.0)
            .wrap(true)
            .selectable(true)
            .build();
        let action = gtk::Button::builder()
            .label("Instalar")
            .halign(gtk::Align::Start)
            .sensitive(false)
            .css_classes(["suggested-action"])
            .build();
        let detail_box = gtk::Box::new(gtk::Orientation::Vertical, 14);
        detail_box.add_css_class("package-detail-content");
        detail_box.append(&detail_title);
        detail_box.append(&detail_body);
        detail_box.append(&action);
        let detail_scroll = gtk::ScrolledWindow::builder()
            .child(&detail_box)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .vexpand(true)
            .build();
        let detail_header = adw::HeaderBar::builder()
            .title_widget(
                &gtk::Label::builder()
                    .label("Detalhes do pacote")
                    .css_classes(["heading"])
                    .build(),
            )
            .build();
        let detail_layout = gtk::Box::new(gtk::Orientation::Vertical, 0);
        detail_layout.append(&detail_header);
        detail_layout.append(&detail_scroll);
        let detail_dialog = adw::Dialog::builder()
            .child(&detail_layout)
            .content_width(680)
            .content_height(480)
            .build();

        let content = gtk::Box::builder()
            .orientation(gtk::Orientation::Vertical)
            .spacing(18)
            .build();
        content.add_css_class("content-page");
        content.append(
            &gtk::Label::builder()
                .label("Software")
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(&tabs);
        content.append(&transaction_panel);
        content.append(&controls);
        content.append(&results_area);
        content.append(&repository_panel);

        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();
        let selected_group = Rc::new(Cell::new(None));
        let selection_handlers = Rc::new(RefCell::new(Vec::<Rc<dyn Fn()>>::new()));
        let list_selection = selected_group.clone();
        let list_handlers = selection_handlers.clone();
        results.connect_row_selected(move |_, row| {
            list_selection.set(row.map(|row| row.index() as usize));
            emit_selection(&list_handlers);
        });
        let card_selection = selected_group.clone();
        let card_handlers = selection_handlers.clone();
        cards.connect_child_activated(move |_, child| {
            card_selection.set(Some(child.index() as usize));
            emit_selection(&card_handlers);
        });

        Self {
            root,
            query,
            search,
            status,
            results,
            cards,
            detail_title,
            detail_body,
            action,
            detail_dialog,
            search_tab,
            installed_tab,
            updates_tab,
            repositories_tab,
            search_controls: controls,
            results_area,
            repository_panel,
            repository_dropdown,
            repository_enable,
            repository_disable,
            optimize_mirrors,
            global_action,
            transaction_panel,
            transaction_label,
            transaction_progress,
            package_groups: Rc::new(RefCell::new(Vec::new())),
            selected_group,
            selection_handlers,
        }
    }

    pub fn set_busy(&self, busy: bool) {
        self.query.set_sensitive(!busy);
        self.search.set_sensitive(!busy);
        self.search
            .set_label(if busy { "Buscando…" } else { "Buscar" });
    }

    pub fn show_results(&self, packages: Vec<PackageRef>) {
        self.clear_results();
        let groups = group_packages(packages);
        *self.package_groups.borrow_mut() = groups.clone();
        self.status.set_label(if groups.is_empty() {
            "Nenhum resultado encontrado"
        } else {
            "Escolha a origem antes de instalar"
        });
        for (group_index, group) in groups.into_iter().enumerate() {
            let Some(package) = group.selected() else {
                continue;
            };
            let safe_name = gtk::glib::markup_escape_text(&package.name);
            let safe_description = gtk::glib::markup_escape_text(&package.description);
            let row = adw::ActionRow::builder()
                .title(safe_name)
                .subtitle(safe_description)
                .title_lines(1)
                .subtitle_lines(1)
                .activatable(true)
                .build();
            row.add_prefix(&package_icon(package, 34));
            if group.packages.iter().any(|package| package.installed) {
                row.add_suffix(&gtk::Label::new(Some("Instalado")));
            }
            let origins = origin_pills(
                group_index,
                &group,
                &self.package_groups,
                &self.selected_group,
                &self.selection_handlers,
            );
            row.add_suffix(&origins);
            self.results.append(&row);

            let card = gtk::Box::new(gtk::Orientation::Vertical, 10);
            card.add_css_class("software-card");
            let card_header = gtk::Box::new(gtk::Orientation::Horizontal, 6);
            card_header.append(&package_icon(package, 36));
            card_header.append(
                &gtk::Label::builder()
                    .label(&package.name)
                    .xalign(0.0)
                    .hexpand(true)
                    .wrap(true)
                    .css_classes(["title-3"])
                    .build(),
            );
            card.append(&card_header);
            card.append(
                &gtk::Label::builder()
                    .label(&package.description)
                    .xalign(0.0)
                    .wrap(true)
                    .lines(2)
                    .ellipsize(gtk::pango::EllipsizeMode::End)
                    .css_classes(["dim-label"])
                    .build(),
            );
            card.append(&origin_pills(
                group_index,
                &group,
                &self.package_groups,
                &self.selected_group,
                &self.selection_handlers,
            ));
            self.cards.insert(&card, -1);
        }
    }

    pub fn show_error(&self, message: &str) {
        self.status.set_label(&format!("Falha: {message}"));
    }

    pub fn selected_package(&self) -> Option<PackageRef> {
        let index = self.selected_group.get()?;
        self.package_groups.borrow().get(index)?.selected().cloned()
    }

    pub fn connect_package_selected(&self, handler: impl Fn() + 'static) {
        self.selection_handlers.borrow_mut().push(Rc::new(handler));
    }

    pub fn present_details(&self, parent: &impl IsA<gtk::Widget>) {
        self.detail_dialog.present(Some(parent));
    }

    pub fn show_details(&self, details: &crate::dbus::PackageDetails) {
        self.detail_title.set_label(&format!(
            "{} • {}",
            details.name,
            origin_label(&details.origin)
        ));
        self.detail_body.set_label(&format!(
            "{}\n\nDisponível: {}  •  Instalado: {}\nDownload: {}  •  Em disco: {}\nLicenças: {}",
            details.description,
            value_or_dash(&details.available_version),
            value_or_dash(&details.installed_version),
            value_or_dash(&details.download_size),
            value_or_dash(&details.installed_size),
            if details.licenses.is_empty() {
                "—".into()
            } else {
                details.licenses.join(", ")
            }
        ));
        self.action.set_label(if details.installed {
            "Remover"
        } else {
            "Instalar"
        });
        self.action.set_sensitive(true);
        if details.installed {
            self.action.remove_css_class("suggested-action");
            self.action.add_css_class("destructive-action");
        } else {
            self.action.remove_css_class("destructive-action");
            self.action.add_css_class("suggested-action");
        }
    }

    pub fn show_detail_error(&self, message: &str) {
        self.detail_title.set_label("Detalhes indisponíveis");
        self.detail_body.set_label(message);
        self.action.set_sensitive(false);
    }

    pub fn show_transaction_progress(&self, percent: u32, message: &str) {
        self.action.set_label(&format!("{percent}%"));
        self.detail_body.set_label(message);
        self.update_transaction(percent, message);
    }

    pub fn begin_transaction(&self, label: &str) {
        self.transaction_panel.set_visible(true);
        self.transaction_label.set_label(label);
        self.transaction_progress.set_fraction(0.0);
        self.transaction_progress.set_text(Some("0%"));
    }

    pub fn update_transaction(&self, percent: u32, message: &str) {
        let percent = percent.min(100);
        self.transaction_label.set_label(message);
        self.transaction_progress
            .set_fraction(f64::from(percent) / 100.0);
        self.transaction_progress
            .set_text(Some(&format!("{percent}%")));
    }

    pub fn finish_transaction(&self, success: bool, message: &str) {
        self.transaction_panel.set_visible(false);
        let status = if success {
            message.to_owned()
        } else {
            format!("Falha: {message}")
        };
        self.status.set_label(&status);
    }

    pub fn select_search(&self) {
        self.clear_results();
        self.search_controls.set_visible(true);
        self.results_area.set_visible(true);
        self.repository_panel.set_visible(false);
        self.global_action.set_visible(true);
        self.global_action.set_label("Limpar cache");
        self.status
            .set_label("Digite ao menos dois caracteres para buscar");
    }

    pub fn select_installed(&self) {
        self.clear_results();
        self.search_controls.set_visible(false);
        self.results_area.set_visible(true);
        self.repository_panel.set_visible(false);
        self.global_action.set_visible(false);
        self.status.set_label("Carregando pacotes instalados…");
    }

    pub fn select_updates(&self) {
        self.clear_results();
        self.search_controls.set_visible(false);
        self.results_area.set_visible(true);
        self.repository_panel.set_visible(false);
        self.global_action.set_visible(true);
        self.global_action.set_label("Atualizar tudo");
        self.status.set_label("Verificando atualizações…");
    }

    pub fn select_repositories(&self) {
        self.clear_results();
        self.search_controls.set_visible(false);
        self.results_area.set_visible(false);
        self.repository_panel.set_visible(true);
        self.global_action.set_visible(false);
    }

    pub fn show_repositories(&self, repositories: &[String]) {
        let values = repositories.iter().map(String::as_str).collect::<Vec<_>>();
        self.repository_dropdown
            .set_model(Some(&gtk::StringList::new(&values)));
        let available = !repositories.is_empty();
        self.repository_dropdown.set_sensitive(available);
        self.repository_enable.set_sensitive(available);
        self.repository_disable.set_sensitive(available);
    }

    pub fn selected_repository(&self) -> Option<String> {
        self.repository_dropdown
            .selected_item()?
            .downcast::<gtk::StringObject>()
            .ok()
            .map(|item| item.string().to_string())
    }

    fn clear_results(&self) {
        while let Some(child) = self.results.first_child() {
            self.results.remove(&child);
        }
        while let Some(child) = self.cards.first_child() {
            self.cards.remove(&child);
        }
        self.package_groups.borrow_mut().clear();
        self.selected_group.set(None);
        self.action.set_sensitive(false);
        if self.detail_dialog.parent().is_some() {
            self.detail_dialog.close();
        }
    }
}

fn package_icon(package: &PackageRef, size: i32) -> gtk::Widget {
    let frame = gtk::Box::new(gtk::Orientation::Vertical, 0);
    frame.add_css_class("package-icon");
    frame.set_width_request(size);
    frame.set_height_request(size);
    frame.set_hexpand(false);
    frame.set_vexpand(false);
    frame.set_overflow(gtk::Overflow::Hidden);
    frame.set_halign(gtk::Align::Center);
    frame.set_valign(gtk::Align::Center);
    let thumbnail_size = size - 6;
    let thumbnail = (!package.icon.is_empty() && std::path::Path::new(&package.icon).is_file())
        .then(|| {
            gtk::gdk_pixbuf::Pixbuf::from_file_at_scale(
                &package.icon,
                thumbnail_size,
                thumbnail_size,
                true,
            )
            .ok()
        })
        .flatten();
    if let Some(thumbnail) = thumbnail {
        let image = gtk::Image::from_pixbuf(Some(&thumbnail));
        image.set_pixel_size(thumbnail_size);
        image.set_halign(gtk::Align::Center);
        image.set_valign(gtk::Align::Center);
        frame.append(&image);
    } else {
        let fallback = package
            .name
            .trim()
            .chars()
            .next()
            .unwrap_or('?')
            .to_uppercase()
            .to_string();
        frame.append(
            &gtk::Label::builder()
                .label(&fallback)
                .css_classes(["package-icon-fallback"])
                .build(),
        );
    }
    frame.upcast()
}

fn emit_selection(handlers: &SelectionHandlers) {
    for handler in handlers.borrow().iter() {
        handler();
    }
}

fn origin_pills(
    group_index: usize,
    group: &PackageGroup,
    package_groups: &Rc<RefCell<Vec<PackageGroup>>>,
    selected_group: &Rc<Cell<Option<usize>>>,
    handlers: &SelectionHandlers,
) -> gtk::Box {
    let origins = gtk::Box::new(gtk::Orientation::Horizontal, 4);
    origins.add_css_class("origin-pills");
    origins.set_valign(gtk::Align::Center);
    let mut first_button: Option<gtk::ToggleButton> = None;
    for (origin_index, candidate) in group.packages.iter().enumerate() {
        let origin = origin_label(&candidate.origin);
        let origin_text = gtk::Label::builder()
            .label(origin)
            .max_width_chars(14)
            .ellipsize(gtk::pango::EllipsizeMode::End)
            .build();
        let button = gtk::ToggleButton::builder()
            .css_classes(["flat", "origin-pill"])
            .tooltip_text(format!("Usar a origem {origin}"))
            .child(&origin_text)
            .build();
        if let Some(first) = &first_button {
            button.set_group(Some(first));
        } else {
            first_button = Some(button.clone());
        }
        button.set_active(origin_index == group.selected);
        let package_groups = package_groups.clone();
        let selected_group = selected_group.clone();
        let handlers = handlers.clone();
        button.connect_clicked(move |button| {
            if !button.is_active() {
                return;
            }
            if let Some(group) = package_groups.borrow_mut().get_mut(group_index) {
                group.selected = origin_index;
            }
            selected_group.set(Some(group_index));
            emit_selection(&handlers);
        });
        origins.append(&button);
    }
    origins
}

fn tab_button(label: &str) -> gtk::ToggleButton {
    gtk::ToggleButton::builder()
        .label(label)
        .css_classes(["flat", "module-tab"])
        .build()
}

fn value_or_dash(value: &str) -> &str {
    if value.is_empty() { "—" } else { value }
}

fn origin_rank(origin: &str) -> u8 {
    match origin {
        "official" => 0,
        "flathub" => 1,
        "aur" => 2,
        _ => 3,
    }
}

fn origin_label(origin: &str) -> &str {
    match origin {
        "official" => "Oficial",
        "flathub" => "Flathub",
        "aur" => "Comunidade",
        value => value,
    }
}

fn group_packages(packages: Vec<PackageRef>) -> Vec<PackageGroup> {
    let mut grouped = BTreeMap::<String, Vec<PackageRef>>::new();
    for package in packages {
        let key = package.name.trim().to_lowercase();
        grouped.entry(key).or_default().push(package);
    }
    grouped
        .into_values()
        .map(|mut packages| {
            packages.sort_by_key(|package| origin_rank(&package.origin));
            PackageGroup {
                packages,
                selected: 0,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package(origin: &str, id: &str) -> PackageRef {
        PackageRef {
            origin: origin.into(),
            id: id.into(),
            name: "Example".into(),
            description: String::new(),
            installed: false,
            icon: String::new(),
        }
    }

    #[test]
    fn grouping_preserves_origins_and_prefers_official() {
        let result = group_packages(vec![
            package("aur", "aur-example"),
            package("flathub", "org.example.App"),
            package("official", "example"),
        ]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].packages.len(), 3);
        assert_eq!(result[0].selected().unwrap().origin, "official");
        assert_eq!(result[0].packages[1].origin, "flathub");
        assert_eq!(result[0].packages[2].origin, "aur");
    }

    #[test]
    fn grouping_is_case_insensitive_but_keeps_distinct_apps() {
        let mut second = package("official", "another");
        second.name = "Another".into();
        let mut duplicate = package("flathub", "example-flatpak");
        duplicate.name = "example".into();
        let result = group_packages(vec![package("official", "example"), duplicate, second]);
        assert_eq!(result.len(), 2);
        assert_eq!(result[1].packages.len(), 2);
    }

    #[test]
    fn package_text_is_safe_for_action_row_markup() {
        let escaped =
            gtk::glib::markup_escape_text("Devices & control points <maintainer@example.org>");
        assert_eq!(
            escaped,
            "Devices &amp; control points &lt;maintainer@example.org&gt;"
        );
    }
}
