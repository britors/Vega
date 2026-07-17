use adw::prelude::*;
use gettextrs::gettext;

use super::{ScreensaverPage, WallpaperPage};

/// Reúne tudo relacionado a "tela": bloqueio de tela e papel de parede — uma
/// única entrada de navegação com abas internas, como o módulo Software.
#[derive(Clone)]
pub struct ScreenPage {
    pub root: gtk::Widget,
    pub screensaver: ScreensaverPage,
    pub wallpaper: WallpaperPage,
}

impl ScreenPage {
    pub fn new() -> Self {
        let screensaver = ScreensaverPage::new();
        let wallpaper = WallpaperPage::new();

        let wallpaper_tab = tab_button(&gettext("Papel de Parede"));
        let screensaver_tab = tab_button(&gettext("Proteção de Tela"));
        wallpaper_tab.set_active(true);
        screensaver_tab.set_group(Some(&wallpaper_tab));

        let tabs = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        tabs.add_css_class("module-tabs");
        tabs.append(&wallpaper_tab);
        tabs.append(&screensaver_tab);

        let stack = gtk::Stack::builder()
            .transition_type(gtk::StackTransitionType::Crossfade)
            .vexpand(true)
            .build();
        stack.add_named(&wallpaper.root, Some("wallpaper"));
        stack.add_named(&screensaver.root, Some("screensaver"));
        stack.set_visible_child_name("wallpaper");

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
                .label(gettext("Bloqueio de tela e papel de parede"))
                .xalign(0.0)
                .css_classes(["dim-label"])
                .build(),
        );
        content.append(&tabs);
        content.append(&stack);

        Self {
            root: content.upcast(),
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
