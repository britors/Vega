mod application;
pub mod dbus;
mod model;
mod ui;

fn main() -> gtk::glib::ExitCode {
    application::run()
}
mod assistant;
