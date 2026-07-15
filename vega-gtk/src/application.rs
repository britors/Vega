use adw::prelude::*;
use gtk::{gio, glib};

use crate::dbus::{
    BackupClient, BackupConfig, BackupEvent, BluetoothClient, DateTimeClient, FirewallClient,
    HardwareClient, KernelClient, LogsClient, NetworkClient, ServicesClient, SnapshotsClient,
    SoftwareClient, SoftwareEvent, StorageClient, SystemClient, UsersClient, VegaDbus,
};
use crate::model::AppIdentity;
use crate::ui::VegaShell;

pub const APPLICATION_ID: &str = "org.lyraos.Vega.Gtk.Devel";

pub fn run() -> glib::ExitCode {
    let app = adw::Application::builder()
        .application_id(APPLICATION_ID)
        .flags(gio::ApplicationFlags::NON_UNIQUE)
        .build();

    app.connect_startup(|_| install_style());
    app.connect_activate(build_window);
    app.run()
}

fn install_style() {
    gtk::Window::set_default_icon_name("vega");
    adw::StyleManager::default().set_color_scheme(adw::ColorScheme::ForceDark);
    let provider = gtk::CssProvider::new();
    provider.load_from_data(include_str!("../resources/style.css"));
    gtk::style_context_add_provider_for_display(
        &gtk::gdk::Display::default().expect("display gráfico disponível"),
        &provider,
        gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}

fn build_window(app: &adw::Application) {
    let identity = AppIdentity::default();
    let shell = VegaShell::new();

    let window = adw::ApplicationWindow::builder()
        .application(app)
        .title(&identity.name)
        .default_width(1280)
        .default_height(800)
        .content(&shell.root)
        .build();
    window.set_icon_name(Some("vega"));

    update_content(shell, identity.version.clone(), window.clone());
    window.present();
}

fn update_content(shell: VegaShell, ui_version: String, window: adw::ApplicationWindow) {
    glib::MainContext::default().spawn_local(async move {
        let dbus = match VegaDbus::connect().await {
            Ok(dbus) => dbus,
            Err(error) => {
                set_unavailable(&shell, &error.to_string());
                return;
            }
        };

        match dbus.system().status().await {
            Ok(status) => {
                shell.backend_status.set_label(&format!(
                    "vegad {} conectado • {}",
                    status.version, status.distro
                ));
                shell
                    .dashboard_system
                    .set_label(&format!("{} • interface nativa ativa", status.distro));
                shell.about_versions.set_label(&format!(
                    "Vega GTK {} • vegad {}",
                    ui_version, status.version
                ));
                shell.about_distro.set_label(&status.distro);
                if !status.logo_path.is_empty() {
                    shell.about_logo.set_from_file(Some(&status.logo_path));
                    shell.about_logo.set_visible(true);
                }
            }
            Err(error) => set_unavailable(&shell, &error.to_string()),
        }

        match dbus.hardware().inventory().await {
            Ok(inventory) => {
                shell.hardware_cpu.set_label(&inventory.cpu);
                shell.hardware_gpu.set_label(&inventory.gpu);
                shell.hardware_ram.set_label(&inventory.ram);
            }
            Err(error) => {
                let message = error.to_string();
                shell.hardware_cpu.set_label(&message);
                shell.hardware_gpu.set_label("—");
                shell.hardware_ram.set_label("—");
            }
        }

        match dbus.hardware().firmware_status().await {
            Ok(status) => shell.hardware_firmware.set_label(&status),
            Err(error) => shell.hardware_firmware.set_label(&error.to_string()),
        }

        match dbus.software().community_layer_name().await {
            Ok(channel) if channel.is_empty() => shell.about_channel.set_label("Nenhuma"),
            Ok(channel) => shell.about_channel.set_label(&channel),
            Err(error) => shell.about_channel.set_label(&error.to_string()),
        }

        match dbus.software().list_updates().await {
            Ok(updates) if updates.is_empty() => shell.dashboard_updates.set_label("Tudo em dia"),
            Ok(updates) => shell
                .dashboard_updates
                .set_label(&format!("{} pacote(s) pendente(s)", updates.len())),
            Err(error) => shell.dashboard_updates.set_label(&error.to_string()),
        }

        match dbus.backup().list_configs().await {
            Ok(configs) if configs.is_empty() => {
                shell.dashboard_backup.set_label("Não configurado")
            }
            Ok(configs) => shell
                .dashboard_backup
                .set_label(&format!("{} destino(s) configurado(s)", configs.len())),
            Err(error) => shell.dashboard_backup.set_label(&error.to_string()),
        }

        match dbus.snapshots().available().await {
            Ok(false) => shell
                .dashboard_snapshots
                .set_label("Não suportado neste sistema"),
            Ok(true) => match dbus.snapshots().list().await {
                Ok(snapshots) if snapshots.is_empty() => {
                    shell.dashboard_snapshots.set_label("Nenhum snapshot")
                }
                Ok(snapshots) => shell
                    .dashboard_snapshots
                    .set_label(&format!("{} snapshot(s)", snapshots.len())),
                Err(error) => shell.dashboard_snapshots.set_label(&error.to_string()),
            },
            Err(error) => shell.dashboard_snapshots.set_label(&error.to_string()),
        }

        match dbus.services().list().await {
            Ok(services) => {
                let struggling = services
                    .iter()
                    .filter(|service| service.available && service.enabled && !service.active)
                    .count();
                shell.dashboard_services.set_label(if struggling == 0 {
                    "Nenhum serviço com problema"
                } else {
                    "Serviço(s) habilitado(s), mas parado(s)"
                });
                if struggling > 0 {
                    shell.dashboard_services.set_label(&format!(
                        "{struggling} serviço(s) habilitado(s), mas parado(s)"
                    ));
                }
            }
            Err(error) => shell.dashboard_services.set_label(&error.to_string()),
        }

        match dbus.system().disk_usage().await {
            Ok((used, total, percent)) => shell
                .dashboard_disk
                .set_label(&format!("{}% • {} de {} usados", percent, used, total)),
            Err(error) => shell.dashboard_disk.set_label(&error.to_string()),
        }

        configure_software(&shell, &window, dbus.clone());
        configure_backup(&shell, dbus.clone());
        configure_snapshots(&shell, dbus.clone());
        configure_kernel(&shell, dbus.clone());
        configure_datetime(&shell, dbus.clone());
        configure_storage(&shell, dbus.clone());
        configure_network(&shell, &window, dbus.clone());
        configure_bluetooth(&shell, &window, dbus.clone());
        configure_services(&shell, dbus.clone());
        configure_users(&shell, dbus.clone());
        configure_logs(&shell, dbus.clone());
        configure_assistant(&shell, dbus.clone());
        configure_driver_action(&shell, &window, dbus);
    });
}

fn configure_assistant(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.assistant.clone();
    page.status
        .set_label(if crate::assistant::keyring_available() {
            "Pronto • credenciais protegidas pelo Secret Service"
        } else {
            "Secret Service indisponível: não será possível armazenar chaves"
        });

    let provider_page = page.clone();
    page.provider.connect_selected_notify(move |_| {
        let settings = crate::assistant::load_settings();
        let provider = crate::assistant::Provider::from_index(provider_page.provider.selected());
        let model = match provider {
            crate::assistant::Provider::Anthropic => settings.anthropic_model,
            crate::assistant::Provider::OpenAi => settings.openai_model,
            crate::assistant::Provider::Gemini => settings.gemini_model,
        };
        provider_page.show_models(vec![model.clone()], &model);
        provider_page.api_key.set_text("");
        let page = provider_page.clone();
        glib::MainContext::default().spawn_local(async move {
            refresh_assistant_models(&page).await;
        });
    });

    let settings_page = page.clone();
    page.save_settings.connect_clicked(move |_| {
        match crate::assistant::save_settings(&settings_page.settings()) {
            Ok(()) => settings_page.status.set_label("Configurações salvas"),
            Err(error) => settings_page.status.set_label(&error.to_string()),
        }
    });

    let key_page = page.clone();
    page.save_key.connect_clicked(move |_| {
        let provider = crate::assistant::Provider::from_index(key_page.provider.selected());
        let key = key_page.api_key.text().to_string();
        let page = key_page.clone();
        glib::MainContext::default().spawn_local(async move {
            page.status.set_label("Salvando chave no keyring…");
            let result =
                gio::spawn_blocking(move || crate::assistant::save_key(provider, &key)).await;
            match result {
                Ok(Ok(())) => {
                    page.api_key.set_text("");
                    page.status
                        .set_label("Chave salva com segurança no keyring");
                    refresh_assistant_models(&page).await;
                }
                Ok(Err(error)) => page.status.set_label(&error.to_string()),
                Err(_) => page.status.set_label("Falha interna ao acessar o keyring"),
            }
        });
    });

    let models_page = page.clone();
    page.refresh_models.connect_clicked(move |_| {
        let page = models_page.clone();
        glib::MainContext::default().spawn_local(async move {
            refresh_assistant_models(&page).await;
        });
    });

    let remove_page = page.clone();
    page.remove_key.connect_clicked(move |_| {
        let provider = crate::assistant::Provider::from_index(remove_page.provider.selected());
        let dialog = adw::AlertDialog::new(
            Some("Remover chave de API?"),
            Some(&format!(
                "A chave de {} será apagada do keyring.",
                provider.label()
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("remove", "Remover")]);
        dialog.set_response_appearance("remove", adw::ResponseAppearance::Destructive);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = remove_page.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "remove" {
                return;
            }
            let result = gio::spawn_blocking(move || crate::assistant::clear_key(provider)).await;
            match result {
                Ok(Ok(())) => page.status.set_label("Chave removida do keyring"),
                Ok(Err(error)) => page.status.set_label(&error.to_string()),
                Err(_) => page.status.set_label("Falha interna ao acessar o keyring"),
            }
        });
    });

    let clear_page = page.clone();
    page.clear_history.connect_clicked(move |_| {
        clear_page.clear();
        match crate::assistant::clear_history() {
            Ok(()) => clear_page.status.set_label("Conversa limpa"),
            Err(error) => clear_page.status.set_label(&error.to_string()),
        }
    });

    connect_assistant_send(&page.send, &page, &dbus);
    let activate_page = page.clone();
    page.prompt
        .connect_activate(move |_| activate_page.send.emit_clicked());
    let initial_page = page.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_assistant_models(&initial_page).await;
    });
}

async fn refresh_assistant_models(page: &crate::ui::AssistantPage) {
    let provider = crate::assistant::Provider::from_index(page.provider.selected());
    let selected = page.selected_model();
    page.refresh_models.set_sensitive(false);
    page.status
        .set_label(&format!("Consultando modelos da {}…", provider.label()));
    let result = gio::spawn_blocking(move || crate::assistant::list_models(provider)).await;
    match result {
        Ok(Ok(models)) => {
            page.show_models(models, &selected);
            page.status.set_label(&format!(
                "{} modelo(s) compatível(is) disponível(is)",
                page.model.model().map(|model| model.n_items()).unwrap_or(0)
            ));
        }
        Ok(Err(error)) => page.status.set_label(&error.to_string()),
        Err(_) => page
            .status
            .set_label("Falha interna ao consultar os modelos"),
    }
    page.refresh_models.set_sensitive(true);
}

fn connect_assistant_send(button: &gtk::Button, page: &crate::ui::AssistantPage, dbus: &VegaDbus) {
    let page = page.clone();
    let dbus = dbus.clone();
    button.connect_clicked(move |_| {
        let prompt = page.prompt.text().trim().to_owned();
        if prompt.is_empty() {
            return;
        }
        page.prompt.set_text("");
        page.append("user", prompt.clone());
        let _ = crate::assistant::audit("user_message", &prompt);
        let _ = crate::assistant::save_history(&page.history());
        let settings = page.settings();
        if let Err(error) = crate::assistant::save_settings(&settings) {
            page.status.set_label(&error.to_string());
            return;
        }
        let history = page.history();
        let request_page = page.clone();
        let request_dbus = dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            request_page.set_busy(true);
            request_page.status.set_label("Consultando o provedor…");
            let mut history = history;
            let mut input_tokens = 0;
            let mut output_tokens = 0;
            let mut estimated_cost = 0.0;
            let mut has_cost = false;
            let max_rounds = settings.max_rounds_per_message.clamp(1, 20);
            for round in 0..max_rounds {
                request_page
                    .status
                    .set_label(&format!("Pensando… etapa {} de {max_rounds}", round + 1));
                let round_settings = settings.clone();
                let round_history = history.clone();
                let result = gio::spawn_blocking(move || {
                    if round == 0 {
                        crate::assistant::send(&round_settings, &round_history)
                    } else {
                        crate::assistant::continue_after_tool(&round_settings, &round_history)
                    }
                })
                .await;
                let reply = match result {
                    Ok(Ok(reply)) => reply,
                    Ok(Err(error)) => {
                        request_page.status.set_label(&error.to_string());
                        break;
                    }
                    Err(_) => {
                        request_page
                            .status
                            .set_label("Falha interna ao consultar o provedor");
                        break;
                    }
                };
                input_tokens += reply.input_tokens;
                output_tokens += reply.output_tokens;
                if let Some(cost) = reply.estimated_cost_usd {
                    estimated_cost += cost;
                    has_cost = true;
                }
                if !reply.text.is_empty() {
                    request_page.append_progressively(reply.text.clone()).await;
                    let _ = crate::assistant::audit("assistant_message", &reply.text);
                }
                let has_tools = !reply.tool_calls.is_empty();
                for tool_call in reply.tool_calls {
                    handle_assistant_tool(&request_page, &request_dbus, tool_call).await;
                }
                history = request_page.history();
                let _ = crate::assistant::save_history(&history);
                let cost = if has_cost {
                    format!(" • estimativa US$ {estimated_cost:.6}")
                } else {
                    String::new()
                };
                request_page.status.set_label(&format!(
                    "{input_tokens} tokens de entrada • {output_tokens} de saída{cost}"
                ));
                if !has_tools {
                    break;
                }
            }
            request_page.set_busy(false);
        });
    });
}

async fn handle_assistant_tool(
    page: &crate::ui::AssistantPage,
    dbus: &VegaDbus,
    call: crate::assistant::ToolCall,
) {
    let result = match call.name.as_str() {
        "search_packages" => {
            let query = tool_string(&call.input, "query");
            dbus.software().search(&query).await.map(|packages| {
                packages
                    .into_iter()
                    .take(20)
                    .map(|package| {
                        format!(
                            "{} • {} • {}",
                            package.id, package.origin, package.description
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
        }
        "list_available_updates" => dbus.software().list_updates().await.map(|packages| {
            packages
                .into_iter()
                .map(|package| format!("{} • {}", package.id, package.origin))
                .collect::<Vec<_>>()
                .join("\n")
        }),
        "get_system_status" => {
            let status = dbus
                .system()
                .status()
                .await
                .map_err(|error| error.to_string());
            let disk = dbus
                .system()
                .disk_usage()
                .await
                .map_err(|error| error.to_string());
            match (status, disk) {
                (Ok(status), Ok((used, total, percent))) => {
                    page.append(
                        "assistant",
                        format!(
                            "Sistema: {} • vegad {}\nDisco: {used} de {total} ({percent}%)",
                            status.distro, status.version
                        ),
                    );
                    let _ = crate::assistant::audit("read", "get_system_status concluída");
                    return;
                }
                (Err(error), _) | (_, Err(error)) => {
                    page.status.set_label(&error);
                    return;
                }
            }
        }
        name if crate::assistant::is_mutating_tool(name) => {
            handle_assistant_mutation(page, dbus, &call).await;
            return;
        }
        _ => {
            page.status
                .set_label(&format!("Ferramenta desconhecida recusada: {}", call.name));
            let _ = crate::assistant::audit("tool_rejected", &call.name);
            return;
        }
    };
    match result {
        Ok(output) => {
            let output = if output.is_empty() {
                "Nenhum resultado.".into()
            } else {
                output
            };
            page.append("user", format!(
                "<dado_nao_confiavel origem=\"tool:{}\">\n{output}\n</dado_nao_confiavel>\nContinue a resposta usando este resultado.",
                call.name
            ));
            let _ = crate::assistant::audit("read", &format!("{} concluída", call.name));
        }
        Err(error) => {
            page.status.set_label(&error.to_string());
            let _ = crate::assistant::audit("read_error", &format!("{}: {error}", call.name));
        }
    }
}

async fn handle_assistant_mutation(
    page: &crate::ui::AssistantPage,
    dbus: &VegaDbus,
    call: &crate::assistant::ToolCall,
) {
    let origin = tool_string(&call.input, "origin");
    let id = tool_string(&call.input, "id");
    if call.name != "clear_package_cache" && id.is_empty() {
        page.status
            .set_label("Proposta recusada: pacote sem identificador");
        return;
    }
    if call.name == "install_package" && !crate::assistant::install_origin_allowed(&origin) {
        page.status.set_label(
            "Esta origem não pode ser instalada pelo Assistente; use a tela Software para revisão",
        );
        return;
    }
    let (title, description, confirm, destructive) = match call.name.as_str() {
        "install_package" => (
            "Instalar pacote?",
            format!("Instalar {id} da origem {origin}."),
            "Instalar",
            false,
        ),
        "remove_package" => (
            "Remover pacote?",
            format!("Remover {id} da origem {origin}."),
            "Remover",
            true,
        ),
        _ => (
            "Limpar cache?",
            "Remover os pacotes baixados do cache.".into(),
            "Limpar",
            true,
        ),
    };
    let _ = crate::assistant::audit("mutation_proposed", &description);
    let dialog = adw::AlertDialog::new(Some(title), Some(&description));
    dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", confirm)]);
    dialog.set_response_appearance(
        "confirm",
        if destructive {
            adw::ResponseAppearance::Destructive
        } else {
            adw::ResponseAppearance::Suggested
        },
    );
    dialog.set_default_response(Some("cancel"));
    dialog.set_close_response("cancel");
    if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
        page.append(
            "assistant",
            "A proposta foi rejeitada. Nenhuma alteração foi realizada.".into(),
        );
        let _ = crate::assistant::audit("mutation_rejected", &description);
        return;
    }
    let result = match call.name.as_str() {
        "install_package" => dbus.software().install(&origin, &id).await,
        "remove_package" => dbus.software().remove(&origin, &id).await,
        _ => dbus.software().clear_cache().await,
    };
    match result {
        Ok(transaction) => {
            page.append(
                "assistant",
                format!("Ação aprovada e enviada ao vegad (transação #{transaction})."),
            );
            let _ = crate::assistant::audit("mutation_approved", &description);
        }
        Err(error) => {
            page.status.set_label(&error.to_string());
            let _ = crate::assistant::audit("mutation_error", &format!("{description}: {error}"));
        }
    }
}

fn tool_string(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_owned()
}

fn configure_logs(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.logs.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        match load_dbus.logs().list_units().await {
            Ok(units) => load_page.show_units(&units),
            Err(error) => load_page.status.set_label(&error.to_string()),
        }
        refresh_logs_page(&load_page, &load_dbus).await;
    });

    let query_page = page.clone();
    let query_dbus = dbus.clone();
    page.query.connect_clicked(move |_| {
        let page = query_page.clone();
        let dbus = query_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            refresh_logs_page(&page, &dbus).await;
        });
    });
    let search_page = page.clone();
    let search_dbus = dbus.clone();
    page.search.connect_activate(move |_| {
        let page = search_page.clone();
        let dbus = search_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            refresh_logs_page(&page, &dbus).await;
        });
    });
}

async fn refresh_logs_page(page: &crate::ui::LogsPage, dbus: &VegaDbus) {
    page.set_busy(true);
    page.status.set_label("Consultando o journal…");
    let result = dbus
        .logs()
        .query(
            &page.selected_unit(),
            page.selected_priority(),
            page.selected_since(),
            page.search.text().trim(),
            page.selected_limit(),
        )
        .await;
    match result {
        Ok(lines) => page.show_lines(&lines),
        Err(error) => page.status.set_label(&error.to_string()),
    }
    page.set_busy(false);
}

fn configure_users(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.users.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_users_page(&load_page, &load_dbus).await;
    });

    let create_page = page.clone();
    let create_dbus = dbus.clone();
    page.create.connect_clicked(move |_| {
        let username = create_page.username.text().trim().to_owned();
        let is_admin = create_page.admin.is_active();
        let role = if is_admin {
            "administrador"
        } else {
            "usuário comum"
        };
        let dialog = adw::AlertDialog::new(
            Some("Criar usuário?"),
            Some(&format!("A conta {username} será criada como {role}.")),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", "Criar")]);
        dialog.set_response_appearance("confirm", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = create_page.clone();
        let dbus = create_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.set_busy(true);
            page.status.set_label(&format!("Criando {username}…"));
            match dbus.users().create(&username, is_admin).await {
                Ok(()) => {
                    page.username.set_text("");
                    refresh_users_page(&page, &dbus).await;
                }
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.set_busy(false);
        });
    });

    connect_user_action(&page.change_admin, &page, &dbus, UserAction::Admin);
    connect_user_action(&page.remove, &page, &dbus, UserAction::Remove);
}

#[derive(Clone, Copy)]
enum UserAction {
    Admin,
    Remove,
}

fn connect_user_action(
    button: &gtk::Button,
    page: &crate::ui::UsersPage,
    dbus: &VegaDbus,
    action: UserAction,
) {
    let page = page.clone();
    let dbus = dbus.clone();
    button.connect_clicked(move |_| {
        let Some(user) = page.selected() else {
            return;
        };
        let (title, message, confirm) = match action {
            UserAction::Admin if user.is_admin => (
                "Remover privilégios administrativos?",
                format!("{} deixará de administrar o sistema.", user.username),
                "Remover admin",
            ),
            UserAction::Admin => (
                "Conceder privilégios administrativos?",
                format!("{} poderá administrar o sistema.", user.username),
                "Tornar admin",
            ),
            UserAction::Remove => (
                "Remover usuário?",
                format!(
                    "A conta {} e seu diretório pessoal serão removidos.",
                    user.username
                ),
                "Remover",
            ),
        };
        let dialog = adw::AlertDialog::new(Some(title), Some(&message));
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", confirm)]);
        dialog.set_response_appearance(
            "confirm",
            if matches!(action, UserAction::Remove) {
                adw::ResponseAppearance::Destructive
            } else {
                adw::ResponseAppearance::Suggested
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = page.clone();
        let dbus = dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.set_busy(true);
            page.status
                .set_label(&format!("Processando {}…", user.username));
            let result = match action {
                UserAction::Admin => dbus.users().set_admin(&user.username, !user.is_admin).await,
                UserAction::Remove => dbus.users().remove(&user.username).await,
            };
            match result {
                Ok(()) => refresh_users_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.set_busy(false);
        });
    });
}

async fn refresh_users_page(page: &crate::ui::UsersPage, dbus: &VegaDbus) {
    page.status.set_label("Carregando usuários…");
    match dbus.users().list().await {
        Ok(users) => page.show(users),
        Err(error) => page.status.set_label(&error.to_string()),
    }
}

fn configure_services(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.services.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_services_page(&load_page, &load_dbus, false).await;
    });
    let curated_page = page.clone();
    let curated_dbus = dbus.clone();
    page.curated.connect_clicked(move |button| {
        if !button.is_active() {
            return;
        }
        let page = curated_page.clone();
        let dbus = curated_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            refresh_services_page(&page, &dbus, false).await;
        });
    });
    let all_page = page.clone();
    let all_dbus = dbus.clone();
    page.all.connect_clicked(move |button| {
        if !button.is_active() {
            return;
        }
        let page = all_page.clone();
        let dbus = all_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            refresh_services_page(&page, &dbus, true).await;
        });
    });
    connect_service_action(&page.enable, &page, &dbus, ServiceAction::Enable);
    connect_service_action(&page.running, &page, &dbus, ServiceAction::Running);
    connect_service_action(&page.restart, &page, &dbus, ServiceAction::Restart);
}

#[derive(Clone, Copy)]
enum ServiceAction {
    Enable,
    Running,
    Restart,
}

fn connect_service_action(
    button: &gtk::Button,
    page: &crate::ui::ServicesPage,
    dbus: &VegaDbus,
    action: ServiceAction,
) {
    let page = page.clone();
    let dbus = dbus.clone();
    button.connect_clicked(move |_| {
        let Some(service) = page.selected() else {
            return;
        };
        let (verb, detail) = match action {
            ServiceAction::Enable if service.enabled => (
                "Desabilitar",
                "deixará de iniciar automaticamente e será parado",
            ),
            ServiceAction::Enable => (
                "Habilitar",
                "iniciará agora e automaticamente com o sistema",
            ),
            ServiceAction::Running if service.active => {
                ("Parar", "será interrompido até uma nova inicialização")
            }
            ServiceAction::Running => ("Iniciar", "será iniciado nesta sessão"),
            ServiceAction::Restart => ("Reiniciar", "será interrompido e iniciado novamente"),
        };
        let dialog = adw::AlertDialog::new(
            Some(&format!("{verb} serviço?")),
            Some(&format!("{} ({}) {detail}.", service.label, service.name)),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", verb)]);
        if matches!(action, ServiceAction::Restart)
            || matches!(action, ServiceAction::Enable) && !service.enabled
            || matches!(action, ServiceAction::Running) && !service.active
        {
            dialog.set_response_appearance("confirm", adw::ResponseAppearance::Suggested);
        }
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = page.clone();
        let dbus = dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.set_busy(true);
            page.status.set_label(&format!("{verb} {}…", service.label));
            let result = match action {
                ServiceAction::Enable => {
                    dbus.services()
                        .set_enabled(&service.name, !service.enabled)
                        .await
                }
                ServiceAction::Running => {
                    dbus.services()
                        .set_running(&service.name, !service.active)
                        .await
                }
                ServiceAction::Restart => dbus.services().restart(&service.name).await,
            };
            match result {
                Ok(()) => refresh_services_page(&page, &dbus, page.all.is_active()).await,
                Err(error) => {
                    page.status.set_label(&error.to_string());
                    page.set_busy(false);
                }
            }
        });
    });
}

async fn refresh_services_page(page: &crate::ui::ServicesPage, dbus: &VegaDbus, all: bool) {
    page.status.set_label("Carregando serviços…");
    let result = if all {
        dbus.services().list_all().await
    } else {
        dbus.services().list().await
    };
    match result {
        Ok(items) => page.show(items),
        Err(error) => page.status.set_label(&error.to_string()),
    }
}

fn configure_bluetooth(shell: &VegaShell, window: &adw::ApplicationWindow, dbus: VegaDbus) {
    let page = shell.bluetooth.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_bluetooth_page(&load_page, &load_dbus).await;
    });

    let power_page = page.clone();
    let power_dbus = dbus.clone();
    let power_button = page.power.clone();
    power_button.connect_clicked(move |_| {
        let Some(status) = power_page.current_status() else {
            return;
        };
        let enable = !status.powered;
        let verb = if enable { "Ligar" } else { "Desligar" };
        let dialog = adw::AlertDialog::new(
            Some(&format!("{verb} Bluetooth?")),
            Some(if enable {
                "O adaptador Bluetooth será ligado."
            } else {
                "Dispositivos Bluetooth conectados serão desconectados."
            }),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", verb)]);
        dialog.set_response_appearance(
            "confirm",
            if enable {
                adw::ResponseAppearance::Suggested
            } else {
                adw::ResponseAppearance::Default
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = power_page.clone();
        let dbus = power_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.power.set_sensitive(false);
            match dbus.bluetooth().set_powered(enable).await {
                Ok(()) => refresh_bluetooth_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let scan_page = page.clone();
    let scan_dbus = dbus.clone();
    let scan_button = page.scan.clone();
    scan_button.connect_clicked(move |_| {
        let Some(status) = scan_page.current_status() else {
            return;
        };
        let scanning = !status.scanning;
        let page = scan_page.clone();
        let dbus = scan_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            page.scan.set_sensitive(false);
            page.status.set_label(if scanning {
                "Iniciando busca Bluetooth…"
            } else {
                "Parando busca Bluetooth…"
            });
            match dbus.bluetooth().set_scanning(scanning).await {
                Ok(()) => refresh_bluetooth_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let device_page = page.clone();
    let device_dbus = dbus.clone();
    let device_button = page.device_action.clone();
    device_button.connect_clicked(move |_| {
        let Some(device) = device_page.selected_device() else {
            return;
        };
        let action = if !device.paired {
            "Parear"
        } else if device.connected {
            "Desconectar"
        } else {
            "Conectar"
        };
        let dialog = adw::AlertDialog::new(
            Some(&format!("{action} dispositivo?")),
            Some(&format!("{} • {}", device.display_name(), device.address)),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", action)]);
        dialog.set_response_appearance(
            "confirm",
            if device.connected {
                adw::ResponseAppearance::Default
            } else {
                adw::ResponseAppearance::Suggested
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = device_page.clone();
        let dbus = device_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.device_action.set_sensitive(false);
            page.status.set_label(&format!("{action} dispositivo…"));
            let result = if !device.paired {
                dbus.bluetooth().pair(&device.address).await
            } else if device.connected {
                dbus.bluetooth().disconnect(&device.address).await
            } else {
                dbus.bluetooth().connect(&device.address).await
            };
            match result {
                Ok(()) => refresh_bluetooth_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let send_page = page.clone();
    let send_dbus = dbus.clone();
    let send_window = window.clone();
    let send_button = page.send_file.clone();
    send_button.connect_clicked(move |_| {
        let Some(device) = send_page.selected_device() else {
            return;
        };
        let chooser = gtk::FileChooserNative::new(
            Some("Enviar arquivo por Bluetooth"),
            Some(&send_window),
            gtk::FileChooserAction::Open,
            Some("Selecionar"),
            Some("Cancelar"),
        );
        let page = send_page.clone();
        let dbus = send_dbus.clone();
        chooser.connect_response(move |chooser, response| {
            chooser.hide();
            if response != gtk::ResponseType::Accept {
                return;
            }
            let Some(path) = chooser.file().and_then(|file| file.path()) else {
                page.status.set_label("Selecione um arquivo local.");
                return;
            };
            let display_path = path.display().to_string();
            let dialog = adw::AlertDialog::new(
                Some("Enviar arquivo por Bluetooth?"),
                Some(&format!(
                    "Enviar {display_path} para {} ({})?",
                    device.display_name(),
                    device.address
                )),
            );
            dialog.add_responses(&[("cancel", "Cancelar"), ("send", "Enviar")]);
            dialog.set_response_appearance("send", adw::ResponseAppearance::Suggested);
            dialog.set_default_response(Some("cancel"));
            dialog.set_close_response("cancel");
            let page = page.clone();
            let dbus = dbus.clone();
            let address = device.address.clone();
            glib::MainContext::default().spawn_local(async move {
                if dialog.choose_future(gtk::Widget::NONE).await != "send" {
                    return;
                }
                page.send_file.set_sensitive(false);
                page.status.set_label("Enviando arquivo por Bluetooth…");
                match dbus.bluetooth().send_file(&address, &display_path).await {
                    Ok(()) => page.status.set_label("Arquivo enviado com sucesso."),
                    Err(error) => page.status.set_label(&error.to_string()),
                }
                page.send_file.set_sensitive(true);
            });
        });
        chooser.show();
    });

    let receive_page = page.clone();
    let receive_dbus = dbus;
    let receive_window = window.clone();
    let receive_button = page.receive_files.clone();
    receive_button.connect_clicked(move |_| {
        let chooser = gtk::FileChooserNative::new(
            Some("Pasta para arquivos recebidos"),
            Some(&receive_window),
            gtk::FileChooserAction::SelectFolder,
            Some("Selecionar"),
            Some("Cancelar"),
        );
        let page = receive_page.clone();
        let dbus = receive_dbus.clone();
        chooser.connect_response(move |chooser, response| {
            chooser.hide();
            if response != gtk::ResponseType::Accept {
                return;
            }
            let Some(path) = chooser.file().and_then(|file| file.path()) else {
                page.status.set_label("Selecione uma pasta local.");
                return;
            };
            let directory = path.display().to_string();
            let dialog = adw::AlertDialog::new(
                Some("Ativar recebimento Bluetooth?"),
                Some(&format!(
                    "Arquivos recebidos serão gravados em {directory}. Aceite somente transferências esperadas."
                )),
            );
            dialog.add_responses(&[("cancel", "Cancelar"), ("start", "Ativar")]);
            dialog.set_response_appearance("start", adw::ResponseAppearance::Suggested);
            dialog.set_default_response(Some("cancel"));
            dialog.set_close_response("cancel");
            let page = page.clone();
            let dbus = dbus.clone();
            glib::MainContext::default().spawn_local(async move {
                if dialog.choose_future(gtk::Widget::NONE).await != "start" {
                    return;
                }
                page.receive_files.set_sensitive(false);
                page.status.set_label("Ativando recebimento Bluetooth…");
                match dbus.bluetooth().start_receiver(&directory).await {
                    Ok(()) => refresh_bluetooth_page(&page, &dbus).await,
                    Err(error) => page.status.set_label(&error.to_string()),
                }
            });
        });
        chooser.show();
    });
}

async fn refresh_bluetooth_page(page: &crate::ui::BluetoothPage, dbus: &VegaDbus) {
    let status = dbus.bluetooth().status().await;
    let devices = dbus.bluetooth().devices().await;
    match (status, devices) {
        (Ok(status), Ok(devices)) => page.show(&status, &devices),
        (Err(error), _) | (_, Err(error)) => page.status.set_label(&error.to_string()),
    }
}

fn configure_network(shell: &VegaShell, window: &adw::ApplicationWindow, dbus: VegaDbus) {
    let page = shell.network.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        match load_dbus.network().interfaces().await {
            Ok(items) => load_page.show_interfaces(&items),
            Err(error) => {
                load_page.status.set_label(&error.to_string());
                return;
            }
        }
        match load_dbus.network().wifi().await {
            Ok(items) => load_page.show_wifi(&items),
            Err(error) => load_page.status.set_label(&error.to_string()),
        }
        match load_dbus.network().proxy().await {
            Ok(proxy) => load_page.show_proxy(&proxy),
            Err(error) => load_page.proxy.set_label(&error.to_string()),
        }
        refresh_firewall_page(&load_page, &load_dbus).await;
        load_page.status.set_label("Informações de rede carregadas");
    });

    let interface_page = page.clone();
    let interface_dbus = dbus.clone();
    let interface_action = page.interface_action.clone();
    interface_action.connect_clicked(move |_| {
        let Some(interface) = interface_page.selected_interface() else {
            return;
        };
        let connection = gtk::Entry::builder()
            .text(&interface.name)
            .editable(false)
            .build();
        let address = gtk::Entry::builder()
            .text(&interface.ipv4)
            .placeholder_text("192.168.1.20/24")
            .build();
        let gateway = gtk::Entry::builder()
            .text(&interface.gateway)
            .placeholder_text("192.168.1.1")
            .build();
        let dns = gtk::Entry::builder()
            .text(&interface.dns)
            .placeholder_text("1.1.1.1, 8.8.8.8")
            .build();
        let form = gtk::Grid::builder()
            .column_spacing(10)
            .row_spacing(8)
            .build();
        for (row, (label, field)) in [
            ("Conexão", connection.clone()),
            ("Endereço/CIDR", address.clone()),
            ("Gateway", gateway.clone()),
            ("DNS", dns.clone()),
        ]
        .into_iter()
        .enumerate()
        {
            form.attach(
                &gtk::Label::builder().label(label).xalign(0.0).build(),
                0,
                row as i32,
                1,
                1,
            );
            field.set_hexpand(true);
            form.attach(&field, 1, row as i32, 1, 1);
        }
        let dialog = adw::AlertDialog::new(
            Some("Configurar IPv4 estático?"),
            Some("O NetworkManager substituirá a configuração automática e reconectará esta conexão."),
        );
        dialog.set_extra_child(Some(&form));
        dialog.add_responses(&[("cancel", "Cancelar"), ("apply", "Aplicar")]);
        dialog.set_response_appearance("apply", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = interface_page.clone();
        let dbus = interface_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "apply" {
                return;
            }
            let connection = connection.text().trim().to_owned();
            let address = address.text().trim().to_owned();
            let gateway = gateway.text().trim().to_owned();
            let dns = dns.text().trim().to_owned();
            if connection.is_empty() || !valid_ipv4_cidr(&address) {
                page.status
                    .set_label("Informe uma conexão e um endereço IPv4 com CIDR válido.");
                return;
            }
            if !gateway.is_empty() && gateway.parse::<std::net::Ipv4Addr>().is_err() {
                page.status.set_label("O gateway IPv4 informado é inválido.");
                return;
            }
            page.interface_action.set_sensitive(false);
            page.status.set_label("Aplicando IPv4 estático…");
            match dbus
                .network()
                .set_static_ipv4(&connection, &address, &gateway, &dns)
                .await
            {
                Ok(()) => refresh_interfaces_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let wifi_page = page.clone();
    let wifi_dbus = dbus.clone();
    page.connect_wifi_action(move |network| {
        let disconnect = network.active;
        let password = gtk::PasswordEntry::builder()
            .placeholder_text("Senha da rede")
            .show_peek_icon(true)
            .build();
        let dialog = adw::AlertDialog::new(
            Some(if disconnect {
                "Desconectar do Wi‑Fi?"
            } else {
                "Conectar ao Wi‑Fi?"
            }),
            Some(&format!(
                "{}{}",
                network.ssid,
                if disconnect {
                    " será desconectada deste dispositivo."
                } else {
                    " será conectada pelo NetworkManager."
                }
            )),
        );
        let needs_password = !disconnect && wifi_requires_password(&network.security);
        if needs_password {
            dialog.set_extra_child(Some(&password));
        }
        dialog.add_responses(&[
            ("cancel", "Cancelar"),
            (
                "confirm",
                if disconnect {
                    "Desconectar"
                } else {
                    "Conectar"
                },
            ),
        ]);
        dialog.set_response_appearance(
            "confirm",
            if disconnect {
                adw::ResponseAppearance::Default
            } else {
                adw::ResponseAppearance::Suggested
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = wifi_page.clone();
        let dbus = wifi_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            let secret = password.text().to_string();
            if needs_password && secret.is_empty() {
                page.status.set_label("Informe a senha da rede Wi‑Fi.");
                return;
            }
            page.status.set_label(if disconnect {
                "Desconectando Wi‑Fi…"
            } else {
                "Conectando ao Wi‑Fi…"
            });
            let result = if disconnect {
                dbus.network().disconnect(&network.device).await
            } else {
                dbus.network().connect_wifi(&network.ssid, &secret).await
            };
            match result {
                Ok(()) => refresh_wifi_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let proxy_page = page.clone();
    let proxy_dbus = dbus.clone();
    let proxy_apply = page.proxy_apply.clone();
    proxy_apply.connect_clicked(move |_| {
        let config = proxy_page.proxy_config();
        let clearing = config.http.is_empty()
            && config.https.is_empty()
            && config.socks.is_empty()
            && config.no_proxy.is_empty();
        let dialog = adw::AlertDialog::new(
            Some(if clearing {
                "Remover configuração de proxy?"
            } else {
                "Aplicar proxy global?"
            }),
            Some(if clearing {
                "As variáveis de proxy gerenciadas pelo Vega serão removidas de /etc/environment."
            } else {
                "A configuração será gravada em /etc/environment e poderá exigir uma nova sessão para alcançar todos os aplicativos."
            }),
        );
        dialog.add_responses(&[
            ("cancel", "Cancelar"),
            ("apply", if clearing { "Remover" } else { "Aplicar" }),
        ]);
        dialog.set_response_appearance(
            "apply",
            if clearing {
                adw::ResponseAppearance::Destructive
            } else {
                adw::ResponseAppearance::Suggested
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = proxy_page.clone();
        let dbus = proxy_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "apply" {
                return;
            }
            page.proxy_apply.set_sensitive(false);
            page.proxy.set_label("Aplicando configuração global…");
            match dbus.network().set_proxy(&config).await {
                Ok(()) => match dbus.network().proxy().await {
                    Ok(config) => page.show_proxy(&config),
                    Err(error) => page.proxy.set_label(&error.to_string()),
                },
                Err(error) => page.proxy.set_label(&error.to_string()),
            }
            page.proxy_apply.set_sensitive(true);
        });
    });

    let vpn_page = page.clone();
    let vpn_dbus = dbus.clone();
    let vpn_window = window.clone();
    let vpn_import = page.vpn_import.clone();
    vpn_import.connect_clicked(move |_| {
        let chooser = gtk::FileChooserNative::new(
            Some("Importar perfil OpenVPN"),
            Some(&vpn_window),
            gtk::FileChooserAction::Open,
            Some("Selecionar"),
            Some("Cancelar"),
        );
        let filter = gtk::FileFilter::new();
        filter.set_name(Some("Perfis OpenVPN (*.ovpn)"));
        filter.add_pattern("*.ovpn");
        filter.add_pattern("*.OVPN");
        chooser.add_filter(&filter);
        let page = vpn_page.clone();
        let dbus = vpn_dbus.clone();
        chooser.connect_response(move |chooser, response| {
            chooser.hide();
            if response != gtk::ResponseType::Accept {
                return;
            }
            let Some(path) = chooser.file().and_then(|file| file.path()) else {
                page.vpn_status
                    .set_label("Selecione um arquivo local de perfil OpenVPN.");
                return;
            };
            if !path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("ovpn"))
            {
                page.vpn_status
                    .set_label("O perfil deve possuir a extensão .ovpn.");
                return;
            }
            let display_path = path.display().to_string();
            let dialog = adw::AlertDialog::new(
                Some("Importar perfil OpenVPN?"),
                Some(&format!(
                    "O NetworkManager importará o perfil:\n{display_path}\n\nRevise a origem e o conteúdo do arquivo antes de continuar."
                )),
            );
            dialog.add_responses(&[("cancel", "Cancelar"), ("import", "Importar")]);
            dialog.set_response_appearance("import", adw::ResponseAppearance::Suggested);
            dialog.set_default_response(Some("cancel"));
            dialog.set_close_response("cancel");
            let page = page.clone();
            let dbus = dbus.clone();
            glib::MainContext::default().spawn_local(async move {
                if dialog.choose_future(gtk::Widget::NONE).await != "import" {
                    return;
                }
                page.vpn_import.set_sensitive(false);
                page.vpn_status.set_label("Importando perfil OpenVPN…");
                match dbus.network().import_vpn(&display_path).await {
                    Ok(()) => page
                        .vpn_status
                        .set_label("Perfil importado no NetworkManager."),
                    Err(error) => page.vpn_status.set_label(&error.to_string()),
                }
                page.vpn_import.set_sensitive(true);
            });
        });
        chooser.show();
    });

    let firewall_action = page.firewall_action.clone();
    firewall_action.connect_clicked(move |_| {
        let Some(service) = page.selected_firewall_service() else {
            return;
        };
        let enable = !service.enabled;
        let verb = if enable { "Permitir" } else { "Bloquear" };
        let dialog = adw::AlertDialog::new(
            Some(&format!("{verb} serviço no firewall?")),
            Some(&format!(
                "{} ({}) será {} nas conexões de entrada.",
                service.label,
                service.name,
                if enable { "permitido" } else { "bloqueado" }
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", verb)]);
        dialog.set_response_appearance(
            "confirm",
            if enable {
                adw::ResponseAppearance::Suggested
            } else {
                adw::ResponseAppearance::Default
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let action_page = page.clone();
        let action_dbus = dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            action_page.firewall_action.set_sensitive(false);
            action_page
                .firewall_status
                .set_label(&format!("{verb} {}…", service.label));
            match action_dbus
                .firewall()
                .set_service(&service.name, enable)
                .await
            {
                Ok(()) => refresh_firewall_page(&action_page, &action_dbus).await,
                Err(error) => action_page.firewall_status.set_label(&error.to_string()),
            }
        });
    });
}

async fn refresh_wifi_page(page: &crate::ui::NetworkPage, dbus: &VegaDbus) {
    match dbus.network().wifi().await {
        Ok(items) => {
            page.show_wifi(&items);
            page.status.set_label("Redes Wi‑Fi atualizadas");
        }
        Err(error) => page.status.set_label(&error.to_string()),
    }
}

async fn refresh_interfaces_page(page: &crate::ui::NetworkPage, dbus: &VegaDbus) {
    match dbus.network().interfaces().await {
        Ok(items) => {
            page.show_interfaces(&items);
            page.status.set_label("Interfaces de rede atualizadas");
        }
        Err(error) => page.status.set_label(&error.to_string()),
    }
}

fn valid_ipv4_cidr(value: &str) -> bool {
    let Some((address, prefix)) = value.split_once('/') else {
        return false;
    };
    address.parse::<std::net::Ipv4Addr>().is_ok()
        && prefix.parse::<u8>().is_ok_and(|prefix| prefix <= 32)
}

fn wifi_requires_password(security: &str) -> bool {
    !matches!(
        security.trim().to_ascii_lowercase().as_str(),
        "" | "--" | "open" | "none"
    )
}

async fn refresh_firewall_page(page: &crate::ui::NetworkPage, dbus: &VegaDbus) {
    let status = dbus.firewall().status().await;
    let services = dbus.firewall().services().await;
    match (status, services) {
        (Ok(status), Ok(services)) => page.show_firewall(&status, &services),
        (Err(error), _) | (_, Err(error)) => {
            page.firewall_status.set_label(&error.to_string());
            page.firewall_action.set_sensitive(false);
        }
    }
}

fn configure_storage(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.storage.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_storage_page(&load_page, &load_dbus).await;
    });
    let action_page = page;
    let action_dbus = dbus;
    shell.storage.action.connect_clicked(move |_| {
        let Some(volume) = action_page.selected() else {
            return;
        };
        let unmount = volume.can_unmount;
        let verb = if unmount { "Desmontar" } else { "Montar" };
        let dialog = adw::AlertDialog::new(
            Some(&format!("{verb} volume?")),
            Some(&format!(
                "{} ({})",
                volume.path,
                if volume.mountpoint.is_empty() {
                    "não montado"
                } else {
                    &volume.mountpoint
                }
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", verb)]);
        dialog.set_response_appearance(
            "confirm",
            if unmount {
                adw::ResponseAppearance::Default
            } else {
                adw::ResponseAppearance::Suggested
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = action_page.clone();
        let dbus = action_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.action.set_sensitive(false);
            page.status.set_label(&format!("{verb} {}…", volume.path));
            let result = if unmount {
                dbus.storage().unmount(&volume.path).await
            } else {
                dbus.storage().mount(&volume.path).await
            };
            match result {
                Ok(()) => refresh_storage_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });
}

async fn refresh_storage_page(page: &crate::ui::StoragePage, dbus: &VegaDbus) {
    match dbus.storage().list().await {
        Ok(volumes) => page.show(volumes),
        Err(error) => page.status.set_label(&error.to_string()),
    }
}

fn configure_datetime(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.datetime.clone();
    let load_page = page.clone();
    let load_dbus = dbus.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_datetime_page(&load_page, &load_dbus).await;
    });

    let apply_page = page;
    let apply_dbus = dbus;
    shell.datetime.apply.connect_clicked(move |_| {
        let timezone = crate::ui::DateTimePage::selected(&apply_page.timezone);
        let locale = crate::ui::DateTimePage::selected(&apply_page.locale);
        let keymap = crate::ui::DateTimePage::selected(&apply_page.keymap);
        let ntp = apply_page.ntp.is_active();
        let dialog = adw::AlertDialog::new(
            Some("Alterar data, hora e idioma?"),
            Some(&format!(
                "Aplicar timezone {timezone}, locale {locale}, teclado {keymap} e NTP {} para todo o sistema?",
                if ntp { "ativado" } else { "desativado" }
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("apply", "Aplicar")]);
        dialog.set_response_appearance("apply", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = apply_page.clone();
        let dbus = apply_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "apply" {
                return;
            }
            page.apply.set_sensitive(false);
            page.status.set_label("Aplicando configuração global…");
            match dbus
                .datetime()
                .apply(&timezone, ntp, &locale, &keymap)
                .await
            {
                Ok(()) => refresh_datetime_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.apply.set_sensitive(true);
        });
    });
}

async fn refresh_datetime_page(page: &crate::ui::DateTimePage, dbus: &VegaDbus) {
    let status = dbus.datetime().status().await;
    let timezones = dbus.datetime().list_timezones().await;
    let locales = dbus.datetime().list_locales().await;
    let keymaps = dbus.datetime().list_keymaps().await;
    match (status, timezones, locales, keymaps) {
        (Ok(status), Ok(timezones), Ok(locales), Ok(keymaps)) => {
            page.show(&status, &timezones, &locales, &keymaps);
        }
        (Err(error), _, _, _)
        | (_, Err(error), _, _)
        | (_, _, Err(error), _)
        | (_, _, _, Err(error)) => page.status.set_label(&error.to_string()),
    }
}

fn configure_kernel(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.kernel.clone();
    let load_dbus = dbus.clone();
    let load_page = page.clone();
    glib::MainContext::default().spawn_local(async move {
        refresh_kernel_page(&load_page, &load_dbus).await;
    });

    let install_page = page.clone();
    let install_dbus = dbus.clone();
    page.install.connect_clicked(move |_| {
        let Some(kernel) = install_page.selected_available() else {
            return;
        };
        let dialog = adw::AlertDialog::new(
            Some("Instalar kernel?"),
            Some(&format!(
                "Instalar {kernel}? O vegad criará um snapshot quando possível e reconstruirá os artefatos de boot."
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("install", "Instalar")]);
        dialog.set_response_appearance("install", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = install_page.clone();
        let dbus = install_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "install" {
                return;
            }
            page.install.set_sensitive(false);
            page.status.set_label("Solicitando instalação do kernel…");
            match dbus.kernel().install(&kernel).await {
                Ok(transaction_id) => {
                    page.status.set_label(&format!(
                        "Instalação iniciada (transação #{transaction_id}). Atualizando a lista…"
                    ));
                    glib::timeout_future_seconds(3).await;
                    refresh_kernel_page(&page, &dbus).await;
                }
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.install.set_sensitive(true);
        });
    });

    let remove_page = page.clone();
    let remove_dbus = dbus.clone();
    page.remove.connect_clicked(move |_| {
        let Some(kernel) = remove_page.selected_installed() else {
            return;
        };
        let dialog = adw::AlertDialog::new(
            Some("Remover kernel?"),
            Some(&format!(
                "Remover {kernel}? O daemon recusará o kernel em execução ou o último kernel instalado."
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("remove", "Remover")]);
        dialog.set_response_appearance("remove", adw::ResponseAppearance::Destructive);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = remove_page.clone();
        let dbus = remove_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "remove" {
                return;
            }
            page.remove.set_sensitive(false);
            page.status.set_label("Removendo kernel…");
            match dbus.kernel().remove(&kernel).await {
                Ok(()) => refresh_kernel_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let boot_page = page;
    let boot_dbus = dbus;
    shell.kernel.apply_boot.connect_clicked(move |_| {
        let default_entry = boot_page.selected_boot_entry();
        let timeout = boot_page.boot_timeout_input.value_as_int().max(0) as u32;
        let cmdline = boot_page.boot_cmdline_input.text().trim().to_owned();
        let dialog = adw::AlertDialog::new(
            Some("Alterar configuração de boot?"),
            Some(&format!(
                "Aplicar entrada padrão '{}', timeout de {} segundo(s) e os parâmetros informados? Um snapshot será criado quando possível.",
                if default_entry.is_empty() { "padrão atual" } else { &default_entry },
                timeout
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("apply", "Aplicar")]);
        dialog.set_response_appearance("apply", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = boot_page.clone();
        let dbus = boot_dbus.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "apply" {
                return;
            }
            page.apply_boot.set_sensitive(false);
            page.status.set_label("Aplicando configuração de boot…");
            match dbus
                .kernel()
                .apply_boot_config(&default_entry, timeout, &cmdline)
                .await
            {
                Ok(()) => refresh_kernel_page(&page, &dbus).await,
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.apply_boot.set_sensitive(true);
        });
    });
}

async fn refresh_kernel_page(page: &crate::ui::KernelPage, dbus: &VegaDbus) {
    let installed = match dbus.kernel().list_installed().await {
        Ok(kernels) => {
            page.show_installed(&kernels);
            kernels
        }
        Err(error) => {
            page.status.set_label(&error.to_string());
            return;
        }
    };
    match dbus.kernel().available_packages().await {
        Ok(kernels) => page.show_available(&kernels, &installed),
        Err(error) => page.status.set_label(&error.to_string()),
    }
    let boot = dbus.kernel().boot_status().await;
    let entries = dbus.kernel().list_boot_entries().await;
    match (boot, entries) {
        (Ok(boot), Ok(entries)) => {
            page.show_boot(&boot, &entries);
            page.status.set_label("Informações carregadas pelo vegad");
        }
        (Err(error), _) | (_, Err(error)) => page.status.set_label(&error.to_string()),
    }
}

fn configure_snapshots(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.snapshots.clone();
    let client = dbus.snapshots();
    let load_page = page.clone();
    glib::MainContext::default().spawn_local(async move {
        match client.available().await {
            Ok(false) => load_page.set_available(false),
            Ok(true) => match client.list().await {
                Ok(snapshots) => load_page.show_snapshots(snapshots),
                Err(error) => load_page.status.set_label(&error.to_string()),
            },
            Err(error) => {
                load_page.set_available(false);
                load_page.status.set_label(&error.to_string());
            }
        }
    });

    let compare_page = page;
    let compare_dbus = dbus.clone();
    shell.snapshots.compare.connect_clicked(move |_| {
        let Some(snapshot) = compare_page.selected_snapshot() else {
            return;
        };
        compare_page.comparison.set_label("Comparando pacotes…");
        let page = compare_page.clone();
        let client = compare_dbus.snapshots();
        glib::MainContext::default().spawn_local(async move {
            match client.diff_packages(snapshot.id).await {
                Ok(changes) => page.show_comparison(&changes),
                Err(error) => page.comparison.set_label(&error.to_string()),
            }
        });
    });

    let create_page = shell.snapshots.clone();
    let create_dbus = dbus.clone();
    shell.snapshots.create.connect_clicked(move |_| {
        let description = gtk::Entry::builder()
            .placeholder_text("Descrição do ponto de restauração")
            .build();
        let dialog = adw::AlertDialog::new(
            Some("Criar ponto de restauração?"),
            Some("O snapshot será criado pelo backend disponível no sistema."),
        );
        dialog.set_extra_child(Some(&description));
        dialog.add_responses(&[("cancel", "Cancelar"), ("create", "Criar")]);
        dialog.set_response_appearance("create", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = create_page.clone();
        let client = create_dbus.snapshots();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "create" {
                return;
            }
            let description = description.text().trim().to_owned();
            if description.is_empty() {
                page.status
                    .set_label("Informe uma descrição para o snapshot.");
                return;
            }
            page.create.set_sensitive(false);
            page.status.set_label("Criando ponto de restauração…");
            match client.create(&description).await {
                Ok(_) => match client.list().await {
                    Ok(snapshots) => page.show_snapshots(snapshots),
                    Err(error) => page.status.set_label(&error.to_string()),
                },
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.create.set_sensitive(true);
        });
    });

    let delete_page = shell.snapshots.clone();
    let delete_dbus = dbus.clone();
    shell.snapshots.delete.connect_clicked(move |_| {
        let Some(snapshot) = delete_page.selected_snapshot() else {
            return;
        };
        let dialog = adw::AlertDialog::new(
            Some("Excluir ponto de restauração?"),
            Some(&format!(
                "O snapshot #{} será excluído permanentemente.",
                snapshot.id
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("delete", "Excluir")]);
        dialog.set_response_appearance("delete", adw::ResponseAppearance::Destructive);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = delete_page.clone();
        let client = delete_dbus.snapshots();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "delete" {
                return;
            }
            page.delete.set_sensitive(false);
            page.status.set_label("Excluindo ponto de restauração…");
            match client.delete(snapshot.id).await {
                Ok(()) => match client.list().await {
                    Ok(snapshots) => page.show_snapshots(snapshots),
                    Err(error) => page.status.set_label(&error.to_string()),
                },
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let rollback_page = shell.snapshots.clone();
    let rollback_dbus = dbus.clone();
    shell.snapshots.rollback.connect_clicked(move |_| {
        let Some(snapshot) = rollback_page.selected_snapshot() else {
            return;
        };
        rollback_page.rollback.set_sensitive(false);
        rollback_page
            .comparison
            .set_label("Carregando revisão obrigatória do rollback…");
        let page = rollback_page.clone();
        let client = rollback_dbus.snapshots();
        glib::MainContext::default().spawn_local(async move {
            let changes = match client.diff_packages(snapshot.id).await {
                Ok(changes) => changes,
                Err(error) => {
                    page.comparison.set_label(&error.to_string());
                    page.rollback.set_sensitive(true);
                    return;
                }
            };
            page.show_comparison(&changes);
            let preview = gtk::TextView::builder()
                .editable(false)
                .cursor_visible(false)
                .monospace(true)
                .wrap_mode(gtk::WrapMode::WordChar)
                .build();
            let preview_text = if changes.is_empty() {
                "Nenhuma diferença de pacotes foi detectada. Arquivos do sistema ainda podem ser alterados."
                    .into()
            } else {
                changes.join("\n")
            };
            preview.buffer().set_text(&preview_text);
            let scroll = gtk::ScrolledWindow::builder()
                .child(&preview)
                .min_content_width(560)
                .min_content_height(240)
                .max_content_height(400)
                .build();
            let dialog = adw::AlertDialog::new(
                Some(&format!("Aplicar snapshot #{}?", snapshot.id)),
                Some("Revise as diferenças. O sistema poderá precisar ser reiniciado após o rollback."),
            );
            dialog.set_extra_child(Some(&scroll));
            dialog.add_responses(&[("cancel", "Cancelar"), ("rollback", "Aplicar rollback")]);
            dialog.set_response_appearance("rollback", adw::ResponseAppearance::Destructive);
            dialog.set_default_response(Some("cancel"));
            dialog.set_close_response("cancel");
            if dialog.choose_future(gtk::Widget::NONE).await != "rollback" {
                page.rollback.set_sensitive(true);
                return;
            }
            page.status.set_label("Aplicando ponto de restauração…");
            match client.rollback(snapshot.id).await {
                Ok(()) => page.status.set_label(
                    "Rollback aplicado. Reinicie o sistema se o backend solicitar.",
                ),
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.rollback.set_sensitive(true);
        });
    });

    let retention_page = shell.snapshots.clone();
    let retention_dbus = dbus;
    shell.snapshots.apply_retention.connect_clicked(move |_| {
        let keep = retention_page.retention.value_as_int().max(1) as u32;
        let dialog = adw::AlertDialog::new(
            Some("Alterar política de retenção?"),
            Some(&format!(
                "O sistema manterá os {keep} snapshots mais recentes. Os excedentes poderão ser removidos pelo backend."
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("apply", "Aplicar")]);
        dialog.set_response_appearance("apply", adw::ResponseAppearance::Destructive);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = retention_page.clone();
        let client = retention_dbus.snapshots();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "apply" {
                return;
            }
            page.apply_retention.set_sensitive(false);
            match client.set_retention(keep).await {
                Ok(()) => page.status.set_label("Política de retenção atualizada."),
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.apply_retention.set_sensitive(true);
        });
    });
}

fn configure_backup(shell: &VegaShell, dbus: VegaDbus) {
    let page = shell.backup.clone();
    let client = dbus.backup();
    let load_page = page.clone();
    glib::MainContext::default().spawn_local(async move {
        match client.list_configs().await {
            Ok(configs) => load_page.show_configs(configs),
            Err(error) => load_page.status.set_label(&error.to_string()),
        }
    });

    let snapshots_page = page.clone();
    let snapshots_dbus = dbus.clone();
    page.configs.connect_row_selected(move |_, row| {
        if row.is_none() {
            return;
        }
        let Some(config) = snapshots_page.selected_config() else {
            return;
        };
        snapshots_page
            .snapshot_status
            .set_label("Carregando snapshots…");
        let page = snapshots_page.clone();
        let client = snapshots_dbus.backup();
        glib::MainContext::default().spawn_local(async move {
            match client.list_snapshots(&config.id).await {
                Ok(snapshots) => page.show_snapshots(snapshots),
                Err(error) => page.snapshot_status.set_label(&error.to_string()),
            }
        });
    });

    let paths_page = page.clone();
    let paths_dbus = dbus.clone();
    page.snapshots.connect_row_selected(move |_, row| {
        if row.is_none() {
            return;
        }
        let (Some(config), Some(snapshot)) =
            (paths_page.selected_config(), paths_page.selected_snapshot())
        else {
            return;
        };
        paths_page.snapshot_paths.set_label("Carregando caminhos…");
        let page = paths_page.clone();
        let client = paths_dbus.backup();
        glib::MainContext::default().spawn_local(async move {
            match client.list_snapshot_paths(&config.id, &snapshot.id).await {
                Ok(paths) => page.show_snapshot_paths(&paths),
                Err(error) => page.snapshot_paths.set_label(&error.to_string()),
            }
        });
    });

    let create_page = page.clone();
    let create_dbus = dbus.clone();
    page.new_config.connect_clicked(move |_| {
        let id = gtk::Entry::builder()
            .placeholder_text("Identificador, por exemplo documentos")
            .build();
        let paths = gtk::Entry::builder()
            .placeholder_text("Caminhos separados por vírgula")
            .build();
        let destination = gtk::Entry::builder()
            .placeholder_text("Diretório ou repositório de destino")
            .build();
        let destination_uuid = gtk::Entry::builder()
            .placeholder_text("UUID do volume (opcional)")
            .build();
        let frequency = gtk::DropDown::from_strings(&["Manual", "Diário", "Semanal"]);
        let form = gtk::Box::new(gtk::Orientation::Vertical, 8);
        form.add_css_class("backup-config-form");
        for (label, field) in [
            ("Identificador", id.clone().upcast::<gtk::Widget>()),
            ("Caminhos", paths.clone().upcast()),
            ("Destino", destination.clone().upcast()),
            ("UUID do destino", destination_uuid.clone().upcast()),
            ("Frequência", frequency.clone().upcast()),
        ] {
            form.append(
                &gtk::Label::builder()
                    .label(label)
                    .xalign(0.0)
                    .css_classes(["dim-label"])
                    .build(),
            );
            form.append(&field);
        }
        let dialog = adw::AlertDialog::new(
            Some("Nova configuração de backup"),
            Some("Os caminhos serão validados pelo vegad antes de serem salvos."),
        );
        dialog.set_extra_child(Some(&form));
        dialog.add_responses(&[("cancel", "Cancelar"), ("create", "Criar")]);
        dialog.set_response_appearance("create", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = create_page.clone();
        let client = create_dbus.backup();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "create" {
                return;
            }
            let parsed_paths = paths
                .text()
                .split(',')
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>();
            let id = id.text().trim().to_owned();
            let destination = destination.text().trim().to_owned();
            if id.is_empty() || destination.is_empty() || parsed_paths.is_empty() {
                page.status
                    .set_label("Identificador, ao menos um caminho e destino são obrigatórios.");
                return;
            }
            let frequency = match frequency.selected() {
                1 => "daily",
                2 => "weekly",
                _ => "manual",
            };
            page.new_config.set_sensitive(false);
            page.status.set_label("Criando configuração…");
            let config = BackupConfig {
                id,
                paths: parsed_paths,
                destination,
                destination_uuid: destination_uuid.text().trim().to_owned(),
                frequency: frequency.into(),
            };
            match client.create_config(config).await {
                Ok(_) => match client.list_configs().await {
                    Ok(configs) => page.show_configs(configs),
                    Err(error) => page.status.set_label(&error.to_string()),
                },
                Err(error) => page.status.set_label(&error.to_string()),
            }
            page.new_config.set_sensitive(true);
        });
    });

    let delete_page = page.clone();
    let delete_dbus = dbus.clone();
    page.delete_config.connect_clicked(move |_| {
        let Some(config) = delete_page.selected_config() else {
            return;
        };
        let dialog = adw::AlertDialog::new(
            Some("Excluir configuração de backup?"),
            Some(&format!(
                "A configuração {} será removida. Os dados já armazenados no destino não serão apagados automaticamente.",
                config.id
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("delete", "Excluir")]);
        dialog.set_response_appearance("delete", adw::ResponseAppearance::Destructive);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = delete_page.clone();
        let client = delete_dbus.backup();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "delete" {
                return;
            }
            page.delete_config.set_sensitive(false);
            page.status.set_label("Excluindo configuração…");
            match client.delete_config(&config.id).await {
                Ok(()) => match client.list_configs().await {
                    Ok(configs) => page.show_configs(configs),
                    Err(error) => page.status.set_label(&error.to_string()),
                },
                Err(error) => page.status.set_label(&error.to_string()),
            }
        });
    });

    let restore_page = page.clone();
    let restore_dbus = dbus.clone();
    page.restore_selected.connect_clicked(move |_| {
        let Some(snapshot) = restore_page.selected_snapshot() else {
            return;
        };
        let paths = restore_page.selected_paths();
        let target = restore_page.restore_target.text().trim().to_owned();
        if target.is_empty() {
            restore_page
                .snapshot_paths
                .set_label("Informe a pasta de destino antes de restaurar.");
            return;
        }
        if paths.is_empty() {
            restore_page
                .snapshot_paths
                .set_label("Selecione ao menos um caminho para restaurar.");
            return;
        }
        let mode = restore_page.restore_mode_value();
        let replacing = mode == "replace";
        let body = if replacing {
            format!(
                "{} item(ns) poderão substituir arquivos existentes em {}. Esta ação pode causar perda de dados.",
                paths.len(), target
            )
        } else {
            format!(
                "{} item(ns) serão restaurados em uma pasta separada dentro de {}.",
                paths.len(), target
            )
        };
        let dialog = adw::AlertDialog::new(
            Some(if replacing {
                "Substituir arquivos existentes?"
            } else {
                "Restaurar em pasta separada?"
            }),
            Some(&body),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", "Restaurar")]);
        dialog.set_response_appearance(
            "confirm",
            if replacing {
                adw::ResponseAppearance::Destructive
            } else {
                adw::ResponseAppearance::Suggested
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = restore_page.clone();
        let client = restore_dbus.backup();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.restore_selected.set_sensitive(false);
            page.begin("Preparando restauração parcial…");
            let mut events = match client.subscribe().await {
                Ok(events) => events,
                Err(error) => {
                    page.finish(false, &error.to_string());
                    page.restore_selected.set_sensitive(true);
                    return;
                }
            };
            match client
                .restore_items(&snapshot.id, &target, mode, &paths)
                .await
            {
                Ok(id) => monitor_restore_transaction(&page, &mut events, id).await,
                Err(error) => page.finish(false, &error.to_string()),
            }
            page.restore_selected.set_sensitive(true);
        });
    });

    let run_page = page;
    let run_dbus = dbus;
    shell.backup.run_now.connect_clicked(move |_| {
        let Some(config) = run_page.selected_config() else {
            return;
        };
        let dialog = adw::AlertDialog::new(
            Some("Executar backup agora?"),
            Some(&format!(
                "Configuração {} para {} caminho(s).",
                config.id,
                config.paths.len()
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", "Executar")]);
        dialog.set_response_appearance("confirm", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = run_page.clone();
        let client = run_dbus.backup();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.run_now.set_sensitive(false);
            page.begin(&format!("Iniciando backup {}…", config.id));
            let mut events = match client.subscribe().await {
                Ok(events) => events,
                Err(error) => {
                    page.finish(false, &error.to_string());
                    page.run_now.set_sensitive(true);
                    return;
                }
            };
            match client.run_now(&config.id).await {
                Ok(id) => monitor_backup_transaction(&page, &mut events, id).await,
                Err(error) => page.finish(false, &error.to_string()),
            }
            page.run_now.set_sensitive(true);
        });
    });
}

async fn monitor_restore_transaction(
    page: &crate::ui::BackupPage,
    events: &mut crate::dbus::BackupEventStream,
    transaction_id: u32,
) {
    loop {
        match events.next().await {
            Ok(BackupEvent::RestoreProgress(progress))
                if progress.transaction_id == transaction_id =>
            {
                page.update_progress(progress.percent, &progress.message);
            }
            Ok(BackupEvent::RestoreFinished(finished))
                if finished.transaction_id == transaction_id =>
            {
                page.finish(finished.success, &finished.message);
                break;
            }
            Ok(BackupEvent::Alert(alert)) => page.status.set_label(&format!(
                "Alerta em {} após {} falha(s): {}",
                alert.config_id, alert.consecutive_failures, alert.message
            )),
            Ok(_) => {}
            Err(error) => {
                page.finish(false, &error.to_string());
                break;
            }
        }
    }
}

async fn monitor_backup_transaction(
    page: &crate::ui::BackupPage,
    events: &mut crate::dbus::BackupEventStream,
    transaction_id: u32,
) {
    loop {
        match events.next().await {
            Ok(BackupEvent::BackupProgress(progress))
                if progress.transaction_id == transaction_id =>
            {
                page.update_progress(progress.percent, &progress.message);
            }
            Ok(BackupEvent::BackupFinished(finished))
                if finished.transaction_id == transaction_id =>
            {
                page.finish(finished.success, &finished.message);
                break;
            }
            Ok(BackupEvent::Alert(alert)) => page.status.set_label(&format!(
                "Alerta em {} após {} falha(s): {}",
                alert.config_id, alert.consecutive_failures, alert.message
            )),
            Ok(_) => {}
            Err(error) => {
                page.finish(false, &error.to_string());
                break;
            }
        }
    }
}

fn configure_software(shell: &VegaShell, window: &adw::ApplicationWindow, dbus: VegaDbus) {
    let page = shell.software.clone();
    let button = page.search.clone();
    page.query.connect_activate(move |_| button.emit_clicked());

    let search_page = page.clone();
    page.search_tab.connect_clicked(move |button| {
        if button.is_active() {
            search_page.select_search();
        }
    });

    let installed_page = page.clone();
    let installed_dbus = dbus.clone();
    page.installed_tab.connect_clicked(move |button| {
        if !button.is_active() {
            return;
        }
        installed_page.select_installed();
        installed_page.set_busy(true);
        let page = installed_page.clone();
        let client = installed_dbus.software();
        glib::MainContext::default().spawn_local(async move {
            match client.list_installed().await {
                Ok(packages) => page.show_results(packages),
                Err(error) => page.show_error(&error.to_string()),
            }
            page.set_busy(false);
        });
    });

    let updates_page = page.clone();
    let updates_dbus = dbus.clone();
    page.updates_tab.connect_clicked(move |button| {
        if !button.is_active() {
            return;
        }
        updates_page.select_updates();
        updates_page.set_busy(true);
        let page = updates_page.clone();
        let client = updates_dbus.software();
        glib::MainContext::default().spawn_local(async move {
            match client.list_updates().await {
                Ok(packages) => page.show_results(packages),
                Err(error) => page.show_error(&error.to_string()),
            }
            page.set_busy(false);
        });
    });

    let repositories_page = page.clone();
    let repositories_dbus = dbus.clone();
    page.repositories_tab.connect_clicked(move |button| {
        if !button.is_active() {
            return;
        }
        repositories_page.select_repositories();
        repositories_page.repository_dropdown.set_sensitive(false);
        repositories_page.repository_enable.set_sensitive(false);
        repositories_page.repository_disable.set_sensitive(false);
        let page = repositories_page.clone();
        let client = repositories_dbus.software();
        glib::MainContext::default().spawn_local(async move {
            match client.list_repos().await {
                Ok(repositories) => page.show_repositories(&repositories),
                Err(error) => page.finish_transaction(false, &error.to_string()),
            }
        });
    });

    connect_repository_toggle(&page.repository_enable, true, &page, &dbus);
    connect_repository_toggle(&page.repository_disable, false, &page, &dbus);

    let mirrors_page = page.clone();
    let mirrors_dbus = dbus.clone();
    page.optimize_mirrors.connect_clicked(move |_| {
        let dialog = adw::AlertDialog::new(
            Some("Otimizar mirrors?"),
            Some(
                "O gerenciador de pacotes testará e reorganizará os mirrors quando a distribuição oferecer esse recurso.",
            ),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", "Otimizar")]);
        dialog.set_response_appearance("confirm", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = mirrors_page.clone();
        let client = mirrors_dbus.software();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.optimize_mirrors.set_sensitive(false);
            page.begin_transaction("Otimizando mirrors…");
            let mut events = match client.subscribe().await {
                Ok(events) => events,
                Err(error) => {
                    page.finish_transaction(false, &error.to_string());
                    page.optimize_mirrors.set_sensitive(true);
                    return;
                }
            };
            match client.optimize_mirrors().await {
                Ok(id) => monitor_software_transaction(&page, &mut events, id).await,
                Err(error) => page.finish_transaction(false, &error.to_string()),
            }
            page.optimize_mirrors.set_sensitive(true);
        });
    });

    let global_page = page.clone();
    let global_dbus = dbus.clone();
    page.global_action.connect_clicked(move |_| {
        let update_all = global_page.updates_tab.is_active();
        let (heading, body, confirm, starting) = if update_all {
            (
                "Atualizar tudo?",
                "Executar a atualização completa do sistema e dos Flatpaks agora?",
                "Atualizar",
                "Iniciando atualização completa…",
            )
        } else {
            (
                "Limpar cache?",
                "Remover o cache de pacotes e runtimes Flatpak órfãos agora?",
                "Limpar",
                "Iniciando limpeza de cache…",
            )
        };
        let dialog = adw::AlertDialog::new(Some(heading), Some(body));
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", confirm)]);
        dialog.set_response_appearance("confirm", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");

        let page = global_page.clone();
        let client = global_dbus.software();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.global_action.set_sensitive(false);
            page.begin_transaction(starting);
            let mut events = match client.subscribe().await {
                Ok(events) => events,
                Err(error) => {
                    page.finish_transaction(false, &error.to_string());
                    page.global_action.set_sensitive(true);
                    return;
                }
            };
            let transaction = if update_all {
                client.update_all().await
            } else {
                client.clear_cache().await
            };
            match transaction {
                Ok(id) => monitor_software_transaction(&page, &mut events, id).await,
                Err(error) => page.finish_transaction(false, &error.to_string()),
            }
            page.global_action.set_sensitive(true);
        });
    });

    let page_for_click = page.clone();
    let search_dbus = dbus.clone();
    page.search.connect_clicked(move |_| {
        let query = page_for_click.query.text().trim().to_owned();
        if query.chars().count() < 2 {
            page_for_click
                .status
                .set_label("Digite ao menos dois caracteres para buscar");
            return;
        }

        let page = page_for_click.clone();
        let client = search_dbus.software();
        page.set_busy(true);
        page.status.set_label("Consultando as origens disponíveis…");
        glib::MainContext::default().spawn_local(async move {
            match client.search(&query).await {
                Ok(packages) => page.show_results(packages),
                Err(error) => page.show_error(&error.to_string()),
            }
            page.set_busy(false);
        });
    });

    let page_for_selection = page.clone();
    let details_dbus = dbus.clone();
    let details_window = window.clone();
    page.connect_package_selected(move || {
        let Some(package) = page_for_selection.selected_package() else {
            return;
        };
        let page = page_for_selection.clone();
        let client = details_dbus.software();
        page.detail_title.set_label("Carregando detalhes…");
        page.detail_body
            .set_label("Consultando a origem selecionada…");
        page.action.set_sensitive(false);
        page.present_details(&details_window);
        glib::MainContext::default().spawn_local(async move {
            match client.package_details(&package.origin, &package.id).await {
                Ok(details) => page.show_details(&details),
                Err(error) => page.show_detail_error(&error.to_string()),
            }
        });
    });

    let action_page = page;
    let action_dbus = dbus;
    shell.software.action.connect_clicked(move |_| {
        let Some(package) = action_page.selected_package() else {
            return;
        };
        let page = action_page.clone();
        let client = action_dbus.software();
        glib::MainContext::default().spawn_local(async move {
            let verb = if package.installed {
                "Remover"
            } else {
                "Instalar"
            };
            page.action.set_sensitive(false);
            let pkgbuild = if requires_pkgbuild_review(&package.origin, package.installed) {
                page.action.set_label("Carregando PKGBUILD…");
                match client.aur_pkgbuild(&package.id).await {
                    Ok(pkgbuild) => Some(pkgbuild),
                    Err(error) => {
                        page.show_detail_error(&format!(
                            "Não foi possível revisar o PKGBUILD: {error}"
                        ));
                        return;
                    }
                }
            } else {
                None
            };
            let confirmed = if let Some(pkgbuild) = pkgbuild {
                confirm_aur_install(&package.name, &pkgbuild).await
            } else {
                confirm_package_action(&package.name, verb, package.installed).await
            };
            if !confirmed {
                page.action.set_label(verb);
                page.action.set_sensitive(true);
                return;
            }
            page.action.set_label("Iniciando…");
            page.begin_transaction(&format!("{verb} {}", package.name));
            let mut events = match client.subscribe().await {
                Ok(events) => events,
                Err(error) => {
                    page.show_detail_error(&error.to_string());
                    return;
                }
            };
            let transaction_id = if package.installed {
                client.remove(&package.origin, &package.id).await
            } else {
                client.install(&package.origin, &package.id).await
            };
            let transaction_id = match transaction_id {
                Ok(id) => id,
                Err(error) => {
                    page.show_detail_error(&error.to_string());
                    return;
                }
            };

            loop {
                match events.next().await {
                    Ok(SoftwareEvent::Progress(progress))
                        if progress.transaction_id == transaction_id =>
                    {
                        page.show_transaction_progress(progress.percent, &progress.message);
                    }
                    Ok(SoftwareEvent::Finished(finished))
                        if finished.transaction_id == transaction_id =>
                    {
                        page.detail_body.set_label(&finished.message);
                        page.finish_transaction(finished.success, &finished.message);
                        page.action.set_label(if finished.success {
                            "Concluído"
                        } else {
                            "Falhou"
                        });
                        page.action.set_sensitive(!finished.success);
                        break;
                    }
                    Ok(_) => {}
                    Err(error) => {
                        page.show_detail_error(&error.to_string());
                        break;
                    }
                }
            }
        });
    });
}

fn connect_repository_toggle(
    button: &gtk::Button,
    enabled: bool,
    page: &crate::ui::SoftwarePage,
    dbus: &VegaDbus,
) {
    let page = page.clone();
    let dbus = dbus.clone();
    button.connect_clicked(move |_| {
        let Some(repository) = page.selected_repository() else {
            return;
        };
        let verb = if enabled { "Ativar" } else { "Desativar" };
        let dialog =
            adw::AlertDialog::new(Some(&format!("{verb} repositório?")), Some(&repository));
        dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", verb)]);
        dialog.set_response_appearance(
            "confirm",
            if enabled {
                adw::ResponseAppearance::Suggested
            } else {
                adw::ResponseAppearance::Default
            },
        );
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");
        let page = page.clone();
        let client = dbus.software();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(gtk::Widget::NONE).await != "confirm" {
                return;
            }
            page.repository_enable.set_sensitive(false);
            page.repository_disable.set_sensitive(false);
            page.begin_transaction(&format!("{verb} {repository}…"));
            match client.set_repo_enabled(&repository, enabled).await {
                Ok(()) => page.finish_transaction(true, "Repositório alterado com sucesso"),
                Err(error) => page.finish_transaction(false, &error.to_string()),
            }
            page.repository_enable.set_sensitive(true);
            page.repository_disable.set_sensitive(true);
        });
    });
}

async fn confirm_package_action(name: &str, verb: &str, destructive: bool) -> bool {
    let dialog = adw::AlertDialog::new(
        Some(&format!("{verb} {name}?")),
        Some("A operação será autorizada pelo polkit e acompanhada até a conclusão."),
    );
    dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", verb)]);
    dialog.set_response_appearance(
        "confirm",
        if destructive {
            adw::ResponseAppearance::Destructive
        } else {
            adw::ResponseAppearance::Suggested
        },
    );
    dialog.set_default_response(Some("cancel"));
    dialog.set_close_response("cancel");
    dialog.choose_future(gtk::Widget::NONE).await == "confirm"
}

async fn confirm_aur_install(name: &str, pkgbuild: &str) -> bool {
    let source = gtk::TextView::builder()
        .editable(false)
        .cursor_visible(false)
        .monospace(true)
        .wrap_mode(gtk::WrapMode::None)
        .top_margin(10)
        .bottom_margin(10)
        .left_margin(10)
        .right_margin(10)
        .build();
    source.buffer().set_text(pkgbuild);
    source.add_css_class("pkgbuild-source");
    let scroll = gtk::ScrolledWindow::builder()
        .child(&source)
        .min_content_width(620)
        .min_content_height(360)
        .max_content_height(480)
        .hscrollbar_policy(gtk::PolicyType::Automatic)
        .vscrollbar_policy(gtk::PolicyType::Automatic)
        .build();
    scroll.add_css_class("pkgbuild-review");

    let dialog = adw::AlertDialog::new(
        Some(&format!("Revisar PKGBUILD de {name}")),
        Some(
            "Pacotes da comunidade executam instruções de compilação. Revise o conteúdo antes de continuar.",
        ),
    );
    dialog.set_extra_child(Some(&scroll));
    dialog.add_responses(&[("cancel", "Cancelar"), ("confirm", "Revisei e instalar")]);
    dialog.set_response_appearance("confirm", adw::ResponseAppearance::Suggested);
    dialog.set_default_response(Some("cancel"));
    dialog.set_close_response("cancel");
    dialog.choose_future(gtk::Widget::NONE).await == "confirm"
}

fn requires_pkgbuild_review(origin: &str, installed: bool) -> bool {
    origin.eq_ignore_ascii_case("aur") && !installed
}

async fn monitor_software_transaction(
    page: &crate::ui::SoftwarePage,
    events: &mut crate::dbus::SoftwareEventStream,
    transaction_id: u32,
) {
    loop {
        match events.next().await {
            Ok(SoftwareEvent::Progress(progress)) if progress.transaction_id == transaction_id => {
                page.update_transaction(progress.percent, &progress.message);
            }
            Ok(SoftwareEvent::Finished(finished)) if finished.transaction_id == transaction_id => {
                page.finish_transaction(finished.success, &finished.message);
                break;
            }
            Ok(_) => {}
            Err(error) => {
                page.finish_transaction(false, &error.to_string());
                break;
            }
        }
    }
}

fn configure_driver_action(shell: &VegaShell, window: &adw::ApplicationWindow, dbus: VegaDbus) {
    let dropdown = shell.driver_dropdown.clone();
    let button = shell.driver_apply.clone();
    let window = window.clone();
    button.clone().connect_clicked(move |_| {
        let Some(item) = dropdown.selected_item().and_downcast::<gtk::StringObject>() else {
            return;
        };
        let driver = item.string().to_string();
        let dialog = adw::AlertDialog::new(
            Some("Trocar driver NVIDIA?"),
            Some(&format!(
                "Aplicar {driver}? O sistema criará um snapshot antes da troca."
            )),
        );
        dialog.add_responses(&[("cancel", "Cancelar"), ("apply", "Aplicar")]);
        dialog.set_response_appearance("apply", adw::ResponseAppearance::Suggested);
        dialog.set_default_response(Some("cancel"));
        dialog.set_close_response("cancel");

        let client = dbus.hardware();
        let button = button.clone();
        let window = window.clone();
        glib::MainContext::default().spawn_local(async move {
            if dialog.choose_future(Some(&window)).await != "apply" {
                return;
            }
            button.set_sensitive(false);
            button.set_label("Aplicando…");
            let result = client.switch_nvidia_driver(&driver).await;
            button.set_sensitive(true);
            button.set_label(if result.is_ok() { "Aplicado" } else { "Falhou" });
        });
    });
}

fn set_unavailable(shell: &VegaShell, message: &str) {
    shell.backend_status.set_label(message);
    shell.dashboard_system.set_label("Backend indisponível");
    shell.dashboard_updates.set_label(message);
    shell.dashboard_backup.set_label(message);
    shell.dashboard_snapshots.set_label(message);
    shell.dashboard_services.set_label(message);
    shell.dashboard_disk.set_label(message);
    shell.about_versions.set_label(message);
    shell.hardware_cpu.set_label(message);
    shell.hardware_gpu.set_label("—");
    shell.hardware_ram.set_label("—");
    shell.hardware_firmware.set_label("—");
    shell.driver_apply.set_sensitive(false);
    shell.about_channel.set_label("—");
    shell.about_distro.set_label("—");
}

#[cfg(test)]
mod tests {
    use super::{APPLICATION_ID, requires_pkgbuild_review, valid_ipv4_cidr};

    #[test]
    fn development_id_does_not_replace_the_electron_application() {
        assert_eq!(APPLICATION_ID, "org.lyraos.Vega.Gtk.Devel");
        assert_ne!(APPLICATION_ID, "org.lyraos.Vega");
    }

    #[test]
    fn aur_install_requires_source_review() {
        assert!(requires_pkgbuild_review("aur", false));
        assert!(requires_pkgbuild_review("AUR", false));
        assert!(!requires_pkgbuild_review("official", false));
        assert!(!requires_pkgbuild_review("flathub", false));
    }

    #[test]
    fn removing_an_aur_package_does_not_request_a_build_script() {
        assert!(!requires_pkgbuild_review("aur", true));
    }

    #[test]
    fn static_ipv4_requires_address_and_valid_prefix() {
        assert!(valid_ipv4_cidr("192.168.1.20/24"));
        assert!(valid_ipv4_cidr("10.0.0.1/32"));
        assert!(!valid_ipv4_cidr("192.168.1.20"));
        assert!(!valid_ipv4_cidr("192.168.1.20/33"));
        assert!(!valid_ipv4_cidr("not-an-address/24"));
    }
}
