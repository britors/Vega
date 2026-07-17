use std::{cell::RefCell, rc::Rc};

use adw::prelude::*;
use gettextrs::gettext;

use crate::dbus::DisplayOutput;

const SCALE_CHOICES: [f64; 5] = [1.0, 1.25, 1.5, 1.75, 2.0];
const ROTATION_KEYS: [&str; 4] = ["normal", "left", "right", "inverted"];

#[derive(Clone)]
pub struct DisplayPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub output: gtk::DropDown,
    pub resolution: gtk::DropDown,
    pub refresh: gtk::DropDown,
    pub scale: gtk::DropDown,
    pub rotation: gtk::DropDown,
    pub apply: gtk::Button,
    outputs: Rc<RefCell<Vec<DisplayOutput>>>,
}

impl DisplayPage {
    pub fn new() -> Self {
        let status = gtk::Label::builder()
            .label(gettext("Carregando telas…"))
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();

        let output = gtk::DropDown::from_strings(&[]);
        let resolution = gtk::DropDown::from_strings(&[]);
        let refresh = gtk::DropDown::from_strings(&[]);
        let scale = gtk::DropDown::from_strings(&[]);
        let rotation_labels = rotation_choices();
        let rotation_strs = rotation_labels
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let rotation = gtk::DropDown::from_strings(&rotation_strs);
        for dropdown in [&output, &resolution, &refresh, &scale, &rotation] {
            dropdown.set_size_request(220, -1);
            dropdown.set_halign(gtk::Align::End);
            dropdown.set_valign(gtk::Align::Center);
        }

        let apply = gtk::Button::builder()
            .label(gettext("Aplicar"))
            .halign(gtk::Align::End)
            .sensitive(false)
            .css_classes(["suggested-action"])
            .build();

        let settings = adw::PreferencesGroup::builder()
            .title(gettext("Tela"))
            .description(gettext(
                "Essas preferências valem só para a sua sessão gráfica atual",
            ))
            .build();
        settings.add(&property(&gettext("Monitor"), &output));
        settings.add(&property(&gettext("Resolução"), &resolution));
        settings.add(&property(&gettext("Taxa de atualização"), &refresh));
        settings.add(&property(&gettext("Escala"), &scale));
        settings.add(&property(&gettext("Orientação"), &rotation));

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.append(&status);
        content.append(&settings);
        content.append(&apply);
        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();

        let page = Self {
            root,
            status,
            output,
            resolution,
            refresh,
            scale,
            rotation,
            apply,
            outputs: Rc::new(RefCell::new(Vec::new())),
        };

        // Trocar o monitor selecionado precisa recarregar as resoluções
        // dele; trocar a resolução precisa recarregar as taxas de
        // atualização compatíveis com ela. Escala e orientação são do
        // monitor, não da resolução, então não entram nessa cascata.
        let output_page = page.clone();
        page.output
            .connect_selected_notify(move |_| output_page.refresh_for_selected_output());
        let resolution_page = page.clone();
        page.resolution.connect_selected_notify(move |_| {
            resolution_page.refresh_rates_for_selected_resolution()
        });

        page
    }

    pub fn show(&self, outputs: &[DisplayOutput]) {
        *self.outputs.borrow_mut() = outputs.to_vec();
        let names = outputs
            .iter()
            .map(|output| output.name.as_str())
            .collect::<Vec<_>>();
        self.output.set_model(Some(&gtk::StringList::new(&names)));
        if !outputs.is_empty() {
            let selected = outputs
                .iter()
                .position(|output| output.primary)
                .or_else(|| outputs.iter().position(|output| output.enabled))
                .unwrap_or(0);
            self.output.set_selected(selected as u32);
        }
        self.refresh_for_selected_output();
        self.apply.set_sensitive(!outputs.is_empty());
        self.status.set_label(&if outputs.is_empty() {
            gettext("Nenhum monitor detectado")
        } else {
            gettext("Configuração atual carregada")
        });
    }

    fn refresh_for_selected_output(&self) {
        let Some(current) = self.selected_output() else {
            return;
        };
        let mut resolutions = Vec::new();
        for mode in &current.modes {
            let label = format_resolution(mode.width, mode.height);
            if !resolutions.contains(&label) {
                resolutions.push(label);
            }
        }
        let strs = resolutions.iter().map(String::as_str).collect::<Vec<_>>();
        self.resolution
            .set_model(Some(&gtk::StringList::new(&strs)));
        if let Some(index) = current
            .modes
            .iter()
            .find(|mode| mode.current)
            .map(|mode| format_resolution(mode.width, mode.height))
            .and_then(|label| resolutions.iter().position(|value| *value == label))
        {
            self.resolution.set_selected(index as u32);
        }
        self.refresh_rates_for_selected_resolution();

        set_choices(
            &self.scale,
            &SCALE_CHOICES
                .iter()
                .map(|value| format_scale(*value))
                .collect::<Vec<_>>(),
            &format_scale(current.scale),
        );
        if let Some(index) = ROTATION_KEYS
            .iter()
            .position(|key| *key == current.rotation)
        {
            self.rotation.set_selected(index as u32);
        }
    }

    fn refresh_rates_for_selected_resolution(&self) {
        let Some(current) = self.selected_output() else {
            return;
        };
        let Some(resolution) = Self::selected(&self.resolution) else {
            return;
        };
        let Some((width, height)) = parse_resolution(&resolution) else {
            return;
        };
        let mut rates = Vec::new();
        for mode in current
            .modes
            .iter()
            .filter(|mode| mode.width == width && mode.height == height)
        {
            rates.push(format_refresh(mode.refresh_hz));
        }
        let strs = rates.iter().map(String::as_str).collect::<Vec<_>>();
        self.refresh.set_model(Some(&gtk::StringList::new(&strs)));
        if let Some(index) = current
            .modes
            .iter()
            .find(|mode| mode.width == width && mode.height == height && mode.current)
            .map(|mode| format_refresh(mode.refresh_hz))
            .and_then(|label| rates.iter().position(|value| *value == label))
        {
            self.refresh.set_selected(index as u32);
        }
    }

    fn selected_output(&self) -> Option<DisplayOutput> {
        let name = Self::selected(&self.output)?;
        self.outputs
            .borrow()
            .iter()
            .find(|output| output.name == name)
            .cloned()
    }

    pub fn selected(dropdown: &gtk::DropDown) -> Option<String> {
        dropdown
            .selected_item()
            .and_downcast::<gtk::StringObject>()
            .map(|item| item.string().to_string())
    }

    /// Lê a seleção atual pronta para `DisplayClient::apply`: (output,
    /// width, height, refresh_hz, scale, rotation_key).
    pub fn selection(&self) -> Option<(String, u32, u32, f64, f64, &'static str)> {
        let output = Self::selected(&self.output)?;
        let (width, height) = parse_resolution(&Self::selected(&self.resolution)?)?;
        let refresh_hz = parse_refresh(&Self::selected(&self.refresh)?)?;
        let scale = parse_scale(&Self::selected(&self.scale)?)?;
        let rotation = ROTATION_KEYS[self.rotation.selected() as usize];
        Some((output, width, height, refresh_hz, scale, rotation))
    }
}

impl Default for DisplayPage {
    fn default() -> Self {
        Self::new()
    }
}

fn rotation_choices() -> Vec<String> {
    vec![
        gettext("Normal"),
        gettext("Esquerda (90°)"),
        gettext("Direita (90°)"),
        gettext("Invertida (180°)"),
    ]
}

fn format_resolution(width: u32, height: u32) -> String {
    format!("{width}x{height}")
}

fn parse_resolution(value: &str) -> Option<(u32, u32)> {
    let (width, height) = value.split_once('x')?;
    Some((width.parse().ok()?, height.parse().ok()?))
}

fn format_refresh(hz: f64) -> String {
    gettext("{rate} Hz").replace("{rate}", &format!("{hz:.2}"))
}

fn parse_refresh(value: &str) -> Option<f64> {
    value.split_whitespace().next()?.parse().ok()
}

fn format_scale(scale: f64) -> String {
    format!("{:.0}%", scale * 100.0)
}

fn parse_scale(value: &str) -> Option<f64> {
    value
        .trim_end_matches('%')
        .parse::<f64>()
        .ok()
        .map(|v| v / 100.0)
}

fn set_choices(dropdown: &gtk::DropDown, values: &[String], current: &str) {
    let mut choices = values.to_vec();
    if !current.is_empty() && !choices.iter().any(|value| value == current) {
        choices.push(current.to_owned());
    }
    let strings = choices.iter().map(String::as_str).collect::<Vec<_>>();
    dropdown.set_model(Some(&gtk::StringList::new(&strings)));
    if let Some(index) = choices.iter().position(|value| value == current) {
        dropdown.set_selected(index as u32);
    }
}

fn property(title: &str, widget: &impl IsA<gtk::Widget>) -> adw::ActionRow {
    let row = adw::ActionRow::builder().title(title).build();
    row.add_suffix(widget);
    row
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolution_round_trips_through_format_and_parse() {
        assert_eq!(
            parse_resolution(&format_resolution(1920, 1080)),
            Some((1920, 1080))
        );
    }

    #[test]
    fn refresh_round_trips_through_format_and_parse() {
        let formatted = format_refresh(59.94);
        assert_eq!(parse_refresh(&formatted), Some(59.94));
    }

    #[test]
    fn scale_round_trips_through_format_and_parse() {
        assert_eq!(parse_scale(&format_scale(1.25)), Some(1.25));
    }
}
