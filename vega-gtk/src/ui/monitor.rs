use std::{cell::RefCell, rc::Rc};

use adw::prelude::*;
use gettextrs::gettext;

use crate::dbus::{ProcessInfo, SystemMetrics};

#[derive(Clone)]
pub struct MonitorPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub cpu: gtk::Label,
    pub memory: gtk::Label,
    pub swap: gtk::Label,
    pub disk: gtk::Label,
    pub network: gtk::Label,
    pub list: gtk::ListBox,
    pub kill: gtk::Button,
    items: Rc<RefCell<Vec<ProcessInfo>>>,
}

impl MonitorPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label(gettext("Carregando métricas…"))
            .xalign(0.0)
            .css_classes(["dim-label"])
            .build();

        let metrics_grid = gtk::Grid::builder()
            .column_spacing(24)
            .row_spacing(6)
            .build();
        let cpu = value_label();
        let memory = value_label();
        let swap = value_label();
        let disk = value_label();
        let network = value_label();
        for (row, (caption, value)) in [
            (gettext("CPU"), &cpu),
            (gettext("Memória"), &memory),
            (gettext("Swap"), &swap),
            (gettext("Disco"), &disk),
            (gettext("Rede"), &network),
        ]
        .into_iter()
        .enumerate()
        {
            metrics_grid.attach(
                &gtk::Label::builder()
                    .label(&caption)
                    .xalign(0.0)
                    .css_classes(["dim-label"])
                    .build(),
                0,
                row as i32,
                1,
                1,
            );
            metrics_grid.attach(value, 1, row as i32, 1, 1);
        }
        metrics_grid.add_css_class("card");

        let list = gtk::ListBox::builder()
            .selection_mode(gtk::SelectionMode::Single)
            .css_classes(["boxed-list"])
            .build();
        let kill = gtk::Button::builder()
            .label(gettext("Encerrar processo"))
            .sensitive(false)
            .halign(gtk::Align::Start)
            .css_classes(["destructive-action"])
            .build();

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.append(&status);
        content.append(&metrics_grid);
        content.append(
            &gtk::Label::builder()
                .label(gettext("Processos"))
                .xalign(0.0)
                .css_classes(["title-2"])
                .build(),
        );
        content.append(&list);
        content.append(&kill);

        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();

        let page = Self {
            root,
            status,
            cpu,
            memory,
            swap,
            disk,
            network,
            list,
            kill,
            items: Rc::new(RefCell::new(Vec::new())),
        };
        let selection_page = page.clone();
        page.list
            .connect_row_selected(move |_, row| selection_page.kill.set_sensitive(row.is_some()));
        page
    }

    pub fn show_metrics(&self, metrics: &SystemMetrics, rates: Option<Rates>) {
        self.cpu.set_label(
            &gettext("{percent}%").replace("{percent}", &format!("{:.1}", metrics.cpu_percent)),
        );
        self.memory.set_label(
            &gettext("{used} de {total}")
                .replace("{used}", &format_bytes(metrics.mem_used))
                .replace("{total}", &format_bytes(metrics.mem_total)),
        );
        self.swap.set_label(&if metrics.swap_total == 0 {
            gettext("Sem swap configurado")
        } else {
            gettext("{used} de {total}")
                .replace("{used}", &format_bytes(metrics.swap_used))
                .replace("{total}", &format_bytes(metrics.swap_total))
        });
        match rates {
            Some(rates) => {
                self.disk.set_label(
                    &gettext("{read}/s leitura • {write}/s escrita")
                        .replace("{read}", &format_bytes(rates.disk_read_per_sec))
                        .replace("{write}", &format_bytes(rates.disk_write_per_sec)),
                );
                self.network.set_label(
                    &gettext("{rx}/s recebido • {tx}/s enviado")
                        .replace("{rx}", &format_bytes(rates.net_rx_per_sec))
                        .replace("{tx}", &format_bytes(rates.net_tx_per_sec)),
                );
            }
            None => {
                self.disk.set_label(&gettext("Calculando…"));
                self.network.set_label(&gettext("Calculando…"));
            }
        }
    }

    pub fn show_processes(&self, processes: Vec<ProcessInfo>) {
        while let Some(child) = self.list.first_child() {
            self.list.remove(&child);
        }
        if processes.is_empty() {
            self.list.set_selection_mode(gtk::SelectionMode::None);
            self.list.append(
                &adw::ActionRow::builder()
                    .title(gettext("Nenhum processo listado"))
                    .build(),
            );
        } else {
            self.list.set_selection_mode(gtk::SelectionMode::Single);
            for process in &processes {
                let row = adw::ActionRow::builder()
                    .title(gtk::glib::markup_escape_text(&process.name))
                    .subtitle(gtk::glib::markup_escape_text(
                        &gettext("PID {pid} • {user} • {state}")
                            .replace("{pid}", &process.pid.to_string())
                            .replace("{user}", &process.user)
                            .replace("{state}", &process.state),
                    ))
                    .build();
                row.add_suffix(&gtk::Label::new(Some(
                    &gettext("{cpu}% • {mem}")
                        .replace("{cpu}", &format!("{:.1}", process.cpu_percent.get()))
                        .replace("{mem}", &format_bytes(process.memory)),
                )));
                self.list.append(&row);
            }
        }
        self.status.set_label(
            &gettext("{count} processo(s)").replace("{count}", &processes.len().to_string()),
        );
        *self.items.borrow_mut() = processes;
        self.kill.set_sensitive(false);
    }

    pub fn selected(&self) -> Option<ProcessInfo> {
        self.items
            .borrow()
            .get(self.list.selected_row()?.index() as usize)
            .cloned()
    }
}

impl Default for MonitorPage {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Rates {
    pub disk_read_per_sec: u64,
    pub disk_write_per_sec: u64,
    pub net_rx_per_sec: u64,
    pub net_tx_per_sec: u64,
}

fn value_label() -> gtk::Label {
    gtk::Label::builder()
        .label(gettext("Carregando…"))
        .xalign(0.0)
        .build()
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KiB", "MiB", "GiB", "TiB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

#[cfg(test)]
mod tests {
    use super::format_bytes;

    #[test]
    fn formats_byte_counts_as_readable_units() {
        assert_eq!(format_bytes(900), "900 B");
        assert_eq!(format_bytes(1536), "1.5 KiB");
        assert_eq!(format_bytes(1024 * 1024 * 3), "3.0 MiB");
    }
}
