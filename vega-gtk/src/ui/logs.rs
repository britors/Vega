use adw::prelude::*;

const PRIORITIES: &[&str] = &["", "err", "warning", "info", "debug"];
const SINCE_VALUES: &[&str] = &["-15min", "-1hour", "-24hour", "-7day", ""];
const LIMITS: &[u32] = &[100, 250, 500, 1000];

#[derive(Clone)]
pub struct LogsPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub unit: gtk::DropDown,
    pub priority: gtk::DropDown,
    pub since: gtk::DropDown,
    pub search: gtk::SearchEntry,
    pub limit: gtk::DropDown,
    pub query: gtk::Button,
    pub output: gtk::TextView,
}

impl LogsPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label("Carregando unidades do journal…")
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();
        let unit = gtk::DropDown::from_strings(&["Todas as unidades"]);
        let priority = gtk::DropDown::from_strings(&[
            "Todas as prioridades",
            "Erro ou mais grave",
            "Aviso ou mais grave",
            "Informação ou mais grave",
            "Tudo, incluindo debug",
        ]);
        let since = gtk::DropDown::from_strings(&[
            "Últimos 15 min",
            "Última hora",
            "Últimas 24h",
            "Últimos 7 dias",
            "Sem limite de período",
        ]);
        since.set_selected(1);
        let search = gtk::SearchEntry::builder()
            .placeholder_text("Buscar texto no log…")
            .hexpand(true)
            .build();
        let limit = gtk::DropDown::from_strings(&[
            "100 linhas",
            "250 linhas",
            "500 linhas",
            "1.000 linhas",
        ]);
        limit.set_selected(2);
        let query = gtk::Button::builder()
            .label("Buscar")
            .css_classes(["suggested-action"])
            .build();
        let filters = gtk::FlowBox::builder()
            .column_spacing(8)
            .row_spacing(8)
            .selection_mode(gtk::SelectionMode::None)
            .max_children_per_line(3)
            .build();
        for widget in [
            unit.clone().upcast::<gtk::Widget>(),
            priority.clone().upcast(),
            since.clone().upcast(),
            search.clone().upcast(),
            limit.clone().upcast(),
            query.clone().upcast(),
        ] {
            filters.insert(&widget, -1);
        }
        let output = gtk::TextView::builder()
            .editable(false)
            .cursor_visible(false)
            .monospace(true)
            .wrap_mode(gtk::WrapMode::None)
            .left_margin(12)
            .right_margin(12)
            .top_margin(12)
            .bottom_margin(12)
            .build();
        output.add_css_class("logs-output");
        let output_scroll = gtk::ScrolledWindow::builder()
            .child(&output)
            .min_content_height(420)
            .hscrollbar_policy(gtk::PolicyType::Automatic)
            .vexpand(true)
            .build();
        output_scroll.add_css_class("card");
        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.add_css_class("content-page");
        content.append(
            &gtk::Label::builder()
                .label("Log do Sistema")
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(
            &gtk::Label::builder()
                .label("Consulta somente leitura do journal pelo vegad")
                .xalign(0.0)
                .css_classes(["dim-label"])
                .build(),
        );
        content.append(&filters);
        content.append(&status);
        content.append(&output_scroll);
        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();
        Self {
            root,
            status,
            unit,
            priority,
            since,
            search,
            limit,
            query,
            output,
        }
    }

    pub fn show_units(&self, units: &[String]) {
        let mut labels = vec!["Todas as unidades"];
        labels.extend(units.iter().map(String::as_str));
        self.unit.set_model(Some(&gtk::StringList::new(&labels)));
    }

    pub fn selected_unit(&self) -> String {
        if self.unit.selected() == 0 {
            String::new()
        } else {
            self.selected_text(&self.unit)
        }
    }

    pub fn selected_priority(&self) -> &'static str {
        PRIORITIES
            .get(self.priority.selected() as usize)
            .copied()
            .unwrap_or("")
    }

    pub fn selected_since(&self) -> &'static str {
        SINCE_VALUES
            .get(self.since.selected() as usize)
            .copied()
            .unwrap_or("")
    }

    pub fn selected_limit(&self) -> u32 {
        LIMITS
            .get(self.limit.selected() as usize)
            .copied()
            .unwrap_or(500)
    }

    pub fn show_lines(&self, lines: &[String]) {
        let text = if lines.is_empty() {
            "Nenhuma entrada encontrada para os filtros selecionados.".to_owned()
        } else {
            lines.join("\n")
        };
        self.output.buffer().set_text(&text);
        self.status.set_label(&format!("{} linha(s)", lines.len()));
    }

    pub fn set_busy(&self, busy: bool) {
        self.query.set_sensitive(!busy);
        self.query
            .set_label(if busy { "Buscando…" } else { "Buscar" });
    }

    fn selected_text(&self, dropdown: &gtk::DropDown) -> String {
        dropdown
            .selected_item()
            .and_downcast::<gtk::StringObject>()
            .map(|item| item.string().to_string())
            .unwrap_or_default()
    }
}
