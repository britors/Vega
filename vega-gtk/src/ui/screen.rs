use adw::prelude::*;
use gettextrs::gettext;

use super::{MonitorPage, ScreensaverPage, WallpaperPage};

/// Reúne tudo relacionado a "tela": monitor de processos, bloqueio de tela e
/// papel de parede — uma única entrada de navegação com abas internas, como
/// o módulo Software.
#[derive(Clone)]
pub struct ScreenPage {
    pub root: gtk::Widget,
    pub monitor: MonitorPage,
    pub screensaver: ScreensaverPage,
    pub wallpaper: WallpaperPage,
}

impl ScreenPage {
    pub fn new() -> Self {
        let monitor = MonitorPage::new();
        let screensaver = ScreensaverPage::new();
        let wallpaper = WallpaperPage::new();

        let monitor_tab = tab_button(&gettext("Monitor"));
        let screensaver_tab = tab_button(&gettext("Proteção de Tela"));
        let wallpaper_tab = tab_button(&gettext("Papel de Parede"));
        monitor_tab.set_active(true);
        screensaver_tab.set_group(Some(&monitor_tab));
        wallpaper_tab.set_group(Some(&monitor_tab));

        let tabs = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        tabs.add_css_class("module-tabs");
        tabs.append(&monitor_tab);
        tabs.append(&screensaver_tab);
        tabs.append(&wallpaper_tab);

        let stack = gtk::Stack::builder()
            .transition_type(gtk::StackTransitionType::Crossfade)
            .vexpand(true)
            .build();
        stack.add_named(&monitor.root, Some("monitor"));
        stack.add_named(&screensaver.root, Some("screensaver"));
        stack.add_named(&wallpaper.root, Some("wallpaper"));
        stack.set_visible_child_name("monitor");

        let monitor_stack = stack.clone();
        monitor_tab.connect_clicked(move |button| {
            if button.is_active() {
                monitor_stack.set_visible_child_name("monitor");
            }
        });
        let screensaver_stack = stack.clone();
        screensaver_tab.connect_clicked(move |button| {
            if button.is_active() {
                screensaver_stack.set_visible_child_name("screensaver");
            }
        });
        let wallpaper_stack = stack.clone();
        wallpaper_tab.connect_clicked(move |button| {
            if button.is_active() {
                wallpaper_stack.set_visible_child_name("wallpaper");
            }
        });

        let content = gtk::Box::new(gtk::Orientation::Vertical, 18);
        content.add_css_class("content-page");
        content.append(
            &gtk::Label::builder()
                .label(gettext("Tela"))
                .xalign(0.0)
                .css_classes(["title-1"])
                .build(),
        );
        content.append(
            &gtk::Label::builder()
                .label(gettext(
                    "Monitor de processos, bloqueio de tela e papel de parede",
                ))
                .xalign(0.0)
                .css_classes(["dim-label"])
                .build(),
        );
        content.append(&tabs);
        content.append(&stack);

        Self {
            root: content.upcast(),
            monitor,
            screensaver,
            wallpaper,
        }
    }
}

impl Default for ScreenPage {
    fn default() -> Self {
        Self::new()
    }
}

fn tab_button(label: &str) -> gtk::ToggleButton {
    gtk::ToggleButton::builder()
        .label(label)
        .css_classes(["flat", "module-tab"])
        .build()
}
