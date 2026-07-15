use crate::assistant::{Message, Provider, Settings};
use adw::prelude::*;
use std::{cell::RefCell, rc::Rc};

#[derive(Clone)]
pub struct AssistantPage {
    pub root: gtk::Widget,
    pub status: gtk::Label,
    pub transcript: gtk::TextView,
    pub prompt: gtk::Entry,
    pub send: gtk::Button,
    pub clear_history: gtk::Button,
    pub provider: gtk::DropDown,
    pub model: gtk::DropDown,
    pub refresh_models: gtk::Button,
    pub daily_limit: gtk::SpinButton,
    pub max_rounds: gtk::SpinButton,
    pub api_key: gtk::PasswordEntry,
    pub save_settings: gtk::Button,
    pub save_key: gtk::Button,
    pub remove_key: gtk::Button,
    history: Rc<RefCell<Vec<Message>>>,
    models: Rc<RefCell<Vec<String>>>,
}

impl AssistantPage {
    pub fn new(settings: &Settings, history: Vec<Message>) -> Self {
        let status = gtk::Label::builder()
            .label("Pronto")
            .xalign(0.0)
            .wrap(true)
            .css_classes(["dim-label"])
            .build();
        let transcript = gtk::TextView::builder()
            .editable(false)
            .cursor_visible(false)
            .wrap_mode(gtk::WrapMode::WordChar)
            .left_margin(16)
            .right_margin(16)
            .top_margin(16)
            .bottom_margin(16)
            .vexpand(true)
            .build();
        transcript.add_css_class("assistant-transcript");
        let transcript_scroll = gtk::ScrolledWindow::builder()
            .child(&transcript)
            .min_content_height(380)
            .vexpand(true)
            .build();
        transcript_scroll.add_css_class("card");
        let prompt = gtk::Entry::builder()
            .placeholder_text("Pergunte sobre seu sistema…")
            .hexpand(true)
            .build();
        let send = gtk::Button::builder()
            .label("Enviar")
            .css_classes(["suggested-action"])
            .build();
        let clear_history = gtk::Button::with_label("Limpar conversa");
        let composer = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        composer.append(&prompt);
        composer.append(&send);
        composer.append(&clear_history);
        let provider = gtk::DropDown::from_strings(&Provider::ALL.map(Provider::label));
        provider.set_selected(settings.provider.index());
        let model = gtk::DropDown::from_strings(&[settings.model()]);
        model.set_hexpand(true);
        let refresh_models = gtk::Button::builder()
            .icon_name("view-refresh-symbolic")
            .tooltip_text("Atualizar lista de modelos")
            .build();
        let model_box = gtk::Box::new(gtk::Orientation::Horizontal, 6);
        model_box.append(&model);
        model_box.append(&refresh_models);
        let daily_limit = gtk::SpinButton::with_range(1.0, 5000.0, 1.0);
        daily_limit.set_value(f64::from(settings.max_messages_per_day));
        let max_rounds = gtk::SpinButton::with_range(1.0, 20.0, 1.0);
        max_rounds.set_value(f64::from(settings.max_rounds_per_message));
        let api_key = gtk::PasswordEntry::builder()
            .placeholder_text("Chave armazenada somente no keyring")
            .show_peek_icon(true)
            .hexpand(true)
            .build();
        let save_settings = gtk::Button::builder()
            .label("Salvar configurações")
            .css_classes(["suggested-action"])
            .build();
        let save_key = gtk::Button::with_label("Salvar chave");
        let remove_key = gtk::Button::builder()
            .label("Remover chave")
            .css_classes(["destructive-action"])
            .build();
        let settings_group = adw::PreferencesGroup::builder()
            .title("Configurações e credenciais")
            .description("As chaves ficam no Secret Service e nunca em arquivos do Vega")
            .build();
        settings_group.add(&row("Provedor", &provider));
        settings_group.add(&row("Modelo", &model_box));
        settings_group.add(&row("Limite diário", &daily_limit));
        settings_group.add(&row("Máximo de etapas", &max_rounds));
        settings_group.add(&row("Chave de API", &api_key));
        let settings_actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        settings_actions.set_halign(gtk::Align::End);
        settings_actions.append(&save_settings);
        settings_actions.append(&save_key);
        settings_actions.append(&remove_key);
        let content = gtk::Box::new(gtk::Orientation::Vertical, 14);
        content.add_css_class("content-page");
        content.append(
            &gtk::Label::builder()
                .label("Assistente de IA")
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(&gtk::Label::builder().label("Orientação contextual com privacidade, limites e aprovação explícita para alterações").xalign(0.0).wrap(true).css_classes(["dim-label"]).build());
        content.append(&status);
        content.append(&transcript_scroll);
        content.append(&composer);
        content.append(&settings_group);
        content.append(&settings_actions);
        let root = gtk::ScrolledWindow::builder()
            .child(&content)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .build()
            .upcast();
        let page = Self {
            root,
            status,
            transcript,
            prompt,
            send,
            clear_history,
            provider,
            model,
            refresh_models,
            daily_limit,
            max_rounds,
            api_key,
            save_settings,
            save_key,
            remove_key,
            history: Rc::new(RefCell::new(history)),
            models: Rc::new(RefCell::new(vec![settings.model().to_owned()])),
        };
        page.render_history();
        page
    }
    pub fn settings(&self) -> Settings {
        let mut settings = crate::assistant::load_settings();
        settings.provider = Provider::from_index(self.provider.selected());
        settings.set_model(self.selected_model());
        settings.max_messages_per_day = self.daily_limit.value_as_int().clamp(1, 5000) as u32;
        settings.max_rounds_per_message = self.max_rounds.value_as_int().clamp(1, 20) as u32;
        settings
    }
    pub fn show_models(&self, mut models: Vec<String>, selected: &str) {
        if !models.iter().any(|model| model == selected) && !selected.is_empty() {
            models.insert(0, selected.to_owned());
        }
        let labels = models.iter().map(String::as_str).collect::<Vec<_>>();
        self.model.set_model(Some(&gtk::StringList::new(&labels)));
        let index = models
            .iter()
            .position(|model| model == selected)
            .unwrap_or(0);
        self.model.set_selected(index as u32);
        *self.models.borrow_mut() = models;
    }
    pub fn selected_model(&self) -> String {
        self.models
            .borrow()
            .get(self.model.selected() as usize)
            .cloned()
            .unwrap_or_default()
    }
    pub fn history(&self) -> Vec<Message> {
        self.history.borrow().clone()
    }
    pub fn append(&self, role: &str, content: String) {
        self.history.borrow_mut().push(Message {
            role: role.into(),
            content,
        });
        self.render_history();
    }
    pub async fn append_progressively(&self, content: String) {
        self.history.borrow_mut().push(Message {
            role: "assistant".into(),
            content: String::new(),
        });
        let words = content.split_whitespace().collect::<Vec<_>>();
        for end in (8..words.len())
            .step_by(8)
            .chain(std::iter::once(words.len()))
        {
            if let Some(message) = self.history.borrow_mut().last_mut() {
                message.content = words[..end].join(" ");
            }
            self.render_history();
            gtk::glib::timeout_future(std::time::Duration::from_millis(18)).await;
        }
        if words.is_empty() {
            if let Some(message) = self.history.borrow_mut().last_mut() {
                message.content = content;
            }
            self.render_history();
        }
    }
    pub fn clear(&self) {
        self.history.borrow_mut().clear();
        self.render_history();
    }
    pub fn set_busy(&self, busy: bool) {
        self.prompt.set_sensitive(!busy);
        self.send.set_sensitive(!busy);
        self.send
            .set_label(if busy { "Pensando…" } else { "Enviar" });
    }
    pub fn render_history(&self) {
        let history = self.history.borrow();
        let text = if history.is_empty() {
            "Olá! Posso explicar o estado do sistema e ajudar com tarefas no Vega. Configure um provedor e sua chave abaixo para começar.".into()
        } else {
            history
                .iter()
                .map(|message| {
                    format!(
                        "{}\n{}",
                        if message.role == "user" {
                            "Você"
                        } else {
                            "Vega"
                        },
                        message.content
                    )
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        self.transcript.buffer().set_text(&text);
    }
}
fn row(title: &str, widget: &impl IsA<gtk::Widget>) -> adw::ActionRow {
    let row = adw::ActionRow::builder().title(title).build();
    row.add_suffix(widget);
    row
}
