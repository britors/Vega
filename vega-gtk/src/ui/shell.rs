use adw::prelude::*;

use super::{
    AssistantPage, BackupPage, BluetoothPage, DateTimePage, KernelPage, LogsPage, NetworkPage,
    ServicesPage, SnapshotsPage, SoftwarePage, StoragePage, UsersPage,
};

#[derive(Clone)]
pub struct VegaShell {
    pub root: gtk::Box,
    pub backend_status: gtk::Label,
    pub dashboard_system: gtk::Label,
    pub dashboard_updates: gtk::Label,
    pub dashboard_backup: gtk::Label,
    pub dashboard_snapshots: gtk::Label,
    pub dashboard_services: gtk::Label,
    pub dashboard_disk: gtk::Label,
    pub hardware_cpu: gtk::Label,
    pub hardware_gpu: gtk::Label,
    pub hardware_ram: gtk::Label,
    pub hardware_firmware: gtk::Label,
    pub driver_dropdown: gtk::DropDown,
    pub driver_apply: gtk::Button,
    pub about_versions: gtk::Label,
    pub about_channel: gtk::Label,
    pub about_distro: gtk::Label,
    pub about_logo: gtk::Image,
    pub software: SoftwarePage,
    pub backup: BackupPage,
    pub snapshots: SnapshotsPage,
    pub kernel: KernelPage,
    pub datetime: DateTimePage,
    pub storage: StoragePage,
    pub network: NetworkPage,
    pub bluetooth: BluetoothPage,
    pub services: ServicesPage,
    pub users: UsersPage,
    pub logs: LogsPage,
    pub assistant: AssistantPage,
}

impl VegaShell {
    pub fn new() -> Self {
        let backend_status = status_label("Conectando ao vegad…");
        let dashboard_system = status_label("Carregando informações do sistema…");
        let dashboard_updates = status_label("Carregando…");
        let dashboard_backup = status_label("Carregando…");
        let dashboard_snapshots = status_label("Carregando…");
        let dashboard_services = status_label("Carregando…");
        let dashboard_disk = status_label("Carregando…");
        let hardware_cpu = value_label("Carregando…");
        let hardware_gpu = value_label("Carregando…");
        let hardware_ram = value_label("Carregando…");
        let hardware_firmware = value_label("Carregando…");
        let driver_dropdown =
            gtk::DropDown::from_strings(&["nvidia-open-dkms", "nvidia-580xx-dkms", "nouveau"]);
        let driver_apply = gtk::Button::builder()
            .label("Aplicar")
            .css_classes(["suggested-action"])
            .build();
        let about_versions = status_label("Consultando versões…");
        let about_channel = value_label("Carregando…");
        let about_distro = value_label("Carregando…");
        let about_logo = gtk::Image::builder().pixel_size(32).visible(false).build();
        let software = SoftwarePage::new();
        let backup = BackupPage::new();
        let snapshots = SnapshotsPage::new();
        let kernel = KernelPage::new();
        let datetime = DateTimePage::new();
        let storage = StoragePage::new();
        let network = NetworkPage::new();
        let bluetooth = BluetoothPage::new();
        let services = ServicesPage::new();
        let users = UsersPage::new();
        let logs = LogsPage::new();
        let assistant = AssistantPage::new(
            &crate::assistant::load_settings(),
            crate::assistant::load_history(),
        );

        let stack = gtk::Stack::builder()
            .transition_type(gtk::StackTransitionType::Crossfade)
            .hexpand(true)
            .vexpand(true)
            .build();
        stack.add_titled(
            &dashboard_page(
                &stack,
                DashboardWidgets {
                    backend: &backend_status,
                    system: &dashboard_system,
                    updates: &dashboard_updates,
                    backup: &dashboard_backup,
                    snapshots: &dashboard_snapshots,
                    services: &dashboard_services,
                    disk: &dashboard_disk,
                },
            ),
            Some("dashboard"),
            "Painel",
        );
        stack.add_titled(&storage.root, Some("storage"), "Armazenamento");
        stack.add_titled(&network.root, Some("network"), "Rede e Firewall");
        stack.add_titled(&bluetooth.root, Some("desktop"), "Bluetooth");
        stack.add_titled(&services.root, Some("services"), "Serviços");
        stack.add_titled(&users.root, Some("users"), "Usuários");
        stack.add_titled(&logs.root, Some("logs"), "Log do Sistema");
        stack.add_titled(&assistant.root, Some("assistant"), "Assistente de IA");
        stack.add_titled(&kernel.root, Some("kernel"), "Kernel");
        stack.add_titled(&datetime.root, Some("datetime"), "Data, Hora e Idioma");
        stack.add_titled(&software.root, Some("software"), "Software");
        stack.add_titled(&backup.root, Some("backup"), "Backup");
        stack.add_titled(&snapshots.root, Some("snapshots"), "Pontos de Restauração");
        stack.add_titled(
            &hardware_page(
                &hardware_cpu,
                &hardware_gpu,
                &hardware_ram,
                &hardware_firmware,
                &driver_dropdown,
                &driver_apply,
            ),
            Some("hardware"),
            "Hardware",
        );
        stack.add_titled(
            &about_page(&about_versions, &about_channel, &about_distro, &about_logo),
            Some("about"),
            "Sobre",
        );

        let brand = gtk::Box::new(gtk::Orientation::Horizontal, 10);
        brand.add_css_class("sidebar-brand");
        let mark = gtk::Label::new(Some(" "));
        mark.add_css_class("brand-mark");
        brand.append(&mark);
        brand.append(&gtk::Label::new(Some("Vega")));
        let sidebar_search = gtk::SearchEntry::builder()
            .placeholder_text("Buscar configuração…")
            .build();
        sidebar_search.add_css_class("sidebar-search");

        let nav = gtk::Box::new(gtk::Orientation::Vertical, 2);
        let mut searchable = Vec::new();
        let mut nav_group = None;
        add_nav_section(
            &nav,
            "Principal",
            &[
                ("Painel", "dashboard", "view-grid-symbolic"),
                ("Software", "software", "system-software-install-symbolic"),
                ("Backup", "backup", "document-save-symbolic"),
                (
                    "Pontos de Restauração",
                    "snapshots",
                    "document-revert-symbolic",
                ),
                ("Assistente de IA", "assistant", "system-search-symbolic"),
            ],
            &stack,
            &mut searchable,
            &mut nav_group,
        );
        add_nav_section(
            &nav,
            "Sistema",
            &[
                ("Hardware", "hardware", "computer-symbolic"),
                ("Kernel", "kernel", "preferences-system-symbolic"),
                (
                    "Data, Hora e Idioma",
                    "datetime",
                    "preferences-system-time-symbolic",
                ),
                ("Armazenamento", "storage", "drive-harddisk-symbolic"),
                ("Rede e Firewall", "network", "network-wireless-symbolic"),
                ("Bluetooth", "desktop", "bluetooth-symbolic"),
                ("Serviços", "services", "system-run-symbolic"),
                ("Usuários", "users", "system-users-symbolic"),
                ("Log do Sistema", "logs", "text-x-generic-symbolic"),
            ],
            &stack,
            &mut searchable,
            &mut nav_group,
        );
        add_nav_section(
            &nav,
            "Outros",
            &[("Sobre", "about", "help-about-symbolic")],
            &stack,
            &mut searchable,
            &mut nav_group,
        );
        if let Some((_, _, button, _)) = searchable.first() {
            button.set_active(true);
        }
        let nav_buttons = searchable.clone();
        stack.connect_visible_child_name_notify(move |stack| {
            let active = stack.visible_child_name().unwrap_or_default();
            for (_, target, button, section) in &nav_buttons {
                let is_active = target == active.as_str();
                button.set_active(is_active);
                if is_active {
                    section.set_expanded(true);
                }
            }
        });
        sidebar_search.connect_search_changed(move |entry| {
            let query = entry.text().to_lowercase();
            for (label, _, button, section) in &searchable {
                let matches = query.is_empty() || label.to_lowercase().contains(&query);
                button.set_visible(matches);
                if !query.is_empty() && matches {
                    section.set_expanded(true);
                }
            }
        });
        let sidebar_container = gtk::Box::new(gtk::Orientation::Vertical, 0);
        sidebar_container.add_css_class("vega-sidebar");
        sidebar_container.append(&brand);
        sidebar_container.append(&sidebar_search);
        sidebar_container.append(&nav);

        let split = gtk::Paned::builder()
            .orientation(gtk::Orientation::Horizontal)
            .start_child(&sidebar_container)
            .end_child(&stack)
            .resize_start_child(false)
            .shrink_start_child(false)
            .position(240)
            .vexpand(true)
            .build();

        let title = adw::WindowTitle::new("Vega", "Centro de controle");
        let header = adw::HeaderBar::builder().title_widget(&title).build();
        header.add_css_class("window-chrome");
        let root = gtk::Box::new(gtk::Orientation::Vertical, 0);
        root.add_css_class("app-frame");
        root.append(&header);
        root.append(&split);

        Self {
            root,
            backend_status,
            dashboard_system,
            dashboard_updates,
            dashboard_backup,
            dashboard_snapshots,
            dashboard_services,
            dashboard_disk,
            hardware_cpu,
            hardware_gpu,
            hardware_ram,
            hardware_firmware,
            driver_dropdown,
            driver_apply,
            about_versions,
            about_channel,
            about_distro,
            about_logo,
            software,
            backup,
            snapshots,
            kernel,
            datetime,
            storage,
            network,
            bluetooth,
            services,
            users,
            logs,
            assistant,
        }
    }
}

struct DashboardWidgets<'a> {
    backend: &'a gtk::Label,
    system: &'a gtk::Label,
    updates: &'a gtk::Label,
    backup: &'a gtk::Label,
    snapshots: &'a gtk::Label,
    services: &'a gtk::Label,
    disk: &'a gtk::Label,
}

fn dashboard_page(stack: &gtk::Stack, widgets: DashboardWidgets<'_>) -> gtk::Widget {
    let content = page_box("Painel", "Visão geral do sistema");
    let grid = gtk::FlowBox::builder()
        .column_spacing(8)
        .row_spacing(8)
        .min_children_per_line(2)
        .max_children_per_line(4)
        .selection_mode(gtk::SelectionMode::None)
        .homogeneous(true)
        .build();
    grid.insert(&dashboard_card("Backend", widgets.backend, None, stack), -1);
    grid.insert(&dashboard_card("Sistema", widgets.system, None, stack), -1);
    grid.insert(
        &dashboard_card("Atualizações", widgets.updates, Some("software"), stack),
        -1,
    );
    grid.insert(
        &dashboard_card("Backup", widgets.backup, Some("backup"), stack),
        -1,
    );
    grid.insert(
        &dashboard_card(
            "Pontos de Restauração",
            widgets.snapshots,
            Some("snapshots"),
            stack,
        ),
        -1,
    );
    grid.insert(
        &dashboard_card("Serviços", widgets.services, None, stack),
        -1,
    );
    grid.insert(
        &dashboard_card("Disco (/)", widgets.disk, Some("hardware"), stack),
        -1,
    );
    content.append(&grid);
    scrolled(content)
}

fn dashboard_card(
    title: &str,
    value: &gtk::Label,
    target: Option<&'static str>,
    stack: &gtk::Stack,
) -> gtk::Widget {
    let body = gtk::Box::new(gtk::Orientation::Vertical, 6);
    let title = gtk::Label::builder()
        .label(title)
        .xalign(0.0)
        .css_classes(["dim-label", "card-title"])
        .build();
    body.append(&title);
    body.append(value);
    let button = gtk::Button::builder()
        .child(&body)
        .hexpand(true)
        .css_classes(["card", "dashboard-card"])
        .build();
    if let Some(target) = target {
        let stack = stack.clone();
        button.connect_clicked(move |_| stack.set_visible_child_name(target));
    }
    button.upcast()
}

fn add_nav_section(
    container: &gtk::Box,
    title: &str,
    items: &[(&str, &'static str, &'static str)],
    stack: &gtk::Stack,
    searchable: &mut Vec<(String, String, gtk::ToggleButton, gtk::Expander)>,
    group: &mut Option<gtk::ToggleButton>,
) {
    let section_content = gtk::Box::new(gtk::Orientation::Vertical, 1);
    let section = gtk::Expander::builder()
        .label(title)
        .expanded(true)
        .child(&section_content)
        .build();
    section.add_css_class("sidebar-expander");
    container.append(&section);
    for (label, target, icon_name) in items {
        let label = (*label).to_owned();
        let target = (*target).to_owned();
        let row = gtk::Box::new(gtk::Orientation::Horizontal, 10);
        let icon = gtk::Image::builder()
            .icon_name(*icon_name)
            .pixel_size(16)
            .build();
        icon.add_css_class("sidebar-icon");
        row.append(&icon);
        row.append(
            &gtk::Label::builder()
                .label(&label)
                .xalign(0.0)
                .hexpand(true)
                .build(),
        );
        let button = gtk::ToggleButton::builder()
            .child(&row)
            .halign(gtk::Align::Fill)
            .css_classes(["flat", "sidebar-item"])
            .build();
        if let Some(first) = group.as_ref() {
            button.set_group(Some(first));
        } else {
            *group = Some(button.clone());
        }
        let stack = stack.clone();
        let target_for_click = target.clone();
        button.connect_clicked(move |button| {
            if button.is_active() {
                stack.set_visible_child_name(&target_for_click);
            }
        });
        section_content.append(&button);
        searchable.push((label, target, button, section.clone()));
    }
}

fn hardware_page(
    cpu: &gtk::Label,
    gpu: &gtk::Label,
    ram: &gtk::Label,
    firmware: &gtk::Label,
    driver_dropdown: &gtk::DropDown,
    driver_apply: &gtk::Button,
) -> gtk::Widget {
    let content = page_box("Hardware", "Inventário detectado pelo vegad");
    content.add_css_class("compact-page");
    driver_dropdown.set_size_request(260, -1);
    driver_dropdown.set_valign(gtk::Align::Center);
    driver_apply.set_valign(gtk::Align::Center);
    let group = adw::PreferencesGroup::builder()
        .title("Componentes")
        .build();
    group.add(&property_row("Processador", cpu));
    group.add(&property_row("Vídeo", gpu));
    group.add(&property_row("Memória", ram));
    group.add(&property_row("Firmware", firmware));
    content.append(&group);

    let drivers = adw::PreferencesGroup::builder()
        .title("Troca de driver NVIDIA")
        .description("Um snapshot será criado antes da alteração")
        .build();
    let driver_row = adw::ActionRow::builder().title("Driver").build();
    driver_row.add_suffix(driver_dropdown);
    driver_row.add_suffix(driver_apply);
    drivers.add(&driver_row);
    content.append(&drivers);
    scrolled(content)
}

fn about_page(
    versions: &gtk::Label,
    channel: &gtk::Label,
    distro: &gtk::Label,
    logo: &gtk::Image,
) -> gtk::Widget {
    let content = page_box("Sobre", "Vega para Linux");
    content.append(&card("Versões", versions));
    let system = adw::PreferencesGroup::builder().title("Sistema").build();
    system.add(&property_row("Distribuição", distro));
    let logo_row = adw::ActionRow::builder().title("Logo").build();
    logo_row.add_suffix(logo);
    system.add(&logo_row);
    system.add(&property_row("Camada da comunidade", channel));
    content.append(&system);
    let product = adw::PreferencesGroup::builder().title("Produto").build();
    let creator = value_label("Rodrigo Brito");
    let license = value_label("GNU General Public License v3.0");
    let copyright = value_label("Copyright © 2025–2026 Rodrigo Brito");
    product.add(&property_row("Criador", &creator));
    product.add(&property_row("Licença", &license));
    product.add(&property_row("Direitos autorais", &copyright));
    content.append(&product);
    scrolled(content)
}

fn page_box(title: &str, description: &str) -> gtk::Box {
    let content = gtk::Box::builder()
        .orientation(gtk::Orientation::Vertical)
        .spacing(18)
        .build();
    content.add_css_class("content-page");
    let heading = gtk::Label::builder()
        .label(title)
        .xalign(0.0)
        .css_classes(["title-1"])
        .build();
    let subtitle = gtk::Label::builder()
        .label(description)
        .xalign(0.0)
        .css_classes(["dim-label"])
        .build();
    content.append(&heading);
    content.append(&subtitle);
    content
}

fn card(title: &str, value: &gtk::Label) -> adw::PreferencesGroup {
    let group = adw::PreferencesGroup::builder().title(title).build();
    group.add_css_class("card");
    let row = adw::ActionRow::new();
    row.set_child(Some(value));
    group.add(&row);
    group
}

fn property_row(title: &str, value: &gtk::Label) -> adw::ActionRow {
    value.set_hexpand(true);
    value.set_halign(gtk::Align::Fill);
    value.set_xalign(1.0);
    value.set_wrap(true);
    value.set_wrap_mode(gtk::pango::WrapMode::WordChar);
    value.set_ellipsize(gtk::pango::EllipsizeMode::None);
    value.set_max_width_chars(-1);
    let row = adw::ActionRow::builder()
        .title(title)
        .title_lines(1)
        .build();
    row.add_suffix(value);
    row
}

fn status_label(text: &str) -> gtk::Label {
    gtk::Label::builder()
        .label(text)
        .xalign(0.0)
        .wrap(true)
        .selectable(true)
        .build()
}

fn value_label(text: &str) -> gtk::Label {
    gtk::Label::builder()
        .label(text)
        .xalign(1.0)
        .wrap(true)
        .max_width_chars(56)
        .ellipsize(gtk::pango::EllipsizeMode::End)
        .selectable(true)
        .build()
}

fn scrolled(content: gtk::Box) -> gtk::Widget {
    gtk::ScrolledWindow::builder()
        .child(&content)
        .hscrollbar_policy(gtk::PolicyType::Never)
        .propagate_natural_width(true)
        .build()
        .upcast()
}
