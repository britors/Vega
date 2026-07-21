use std::process::Command;

use gettextrs::gettext;

const CHANNEL: &str = "xfce4-screensaver";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreensaverSettings {
    pub lock_enabled: bool,
    pub lock_delay_minutes: u32,
    pub idle_delay_minutes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreensaverError(String);

impl std::fmt::Display for ScreensaverError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ScreensaverError {}

/// Assim como o papel de parede, bloqueio de tela no XFCE é preferência da
/// sessão do usuário (canal `xfce4-screensaver` do xfconf) — sem passar pelo
/// vegad. O xfce4-screensaver guarda os prazos em minutos, diferente do
/// GNOME (segundos), por isso os campos aqui já nascem em minutos.
pub fn schema_available() -> bool {
    Command::new("xfconf-query")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

pub fn current() -> Option<ScreensaverSettings> {
    if !schema_available() {
        return None;
    }
    Some(ScreensaverSettings {
        lock_enabled: get_bool("/lock/enabled").unwrap_or(true),
        lock_delay_minutes: get_int("/lock/saver-activation/delay").unwrap_or(0),
        idle_delay_minutes: get_int("/saver/idle-activation/delay").unwrap_or(5),
    })
}

pub fn apply(settings: &ScreensaverSettings) -> Result<(), ScreensaverError> {
    if !schema_available() {
        return Err(ScreensaverError(gettext(
            "O xfconf-query não está disponível neste sistema.",
        )));
    }
    // O prazo de bloqueio só faz sentido com o protetor de tela ativo e
    // ativação por ociosidade ligada — sem isso o temporizador nunca dispara.
    set_bool("/saver/enabled", true)?;
    set_bool("/saver/idle-activation/enabled", true)?;
    set_int("/saver/idle-activation/delay", settings.idle_delay_minutes)?;
    set_bool("/lock/enabled", settings.lock_enabled)?;
    set_bool("/lock/saver-activation/enabled", settings.lock_enabled)?;
    set_int("/lock/saver-activation/delay", settings.lock_delay_minutes)?;
    Ok(())
}

fn get_bool(property: &str) -> Option<bool> {
    query(property).map(|value| value == "true")
}

fn get_int(property: &str) -> Option<u32> {
    query(property).and_then(|value| value.parse().ok())
}

fn query(property: &str) -> Option<String> {
    let output = Command::new("xfconf-query")
        .args(["-c", CHANNEL, "-p", property])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn set_bool(property: &str, value: bool) -> Result<(), ScreensaverError> {
    set(property, "bool", if value { "true" } else { "false" })
}

fn set_int(property: &str, value: u32) -> Result<(), ScreensaverError> {
    set(property, "int", &value.to_string())
}

/// Tenta uma alteração simples primeiro; se a propriedade ainda não existir
/// (o daemon xfce4-screensaver nunca escreveu essa chave), recria com `-n`.
fn set(property: &str, kind: &str, value: &str) -> Result<(), ScreensaverError> {
    let updated = Command::new("xfconf-query")
        .args(["-c", CHANNEL, "-p", property, "-s", value])
        .status();
    if updated.is_ok_and(|status| status.success()) {
        return Ok(());
    }
    let created = Command::new("xfconf-query")
        .args(["-c", CHANNEL, "-p", property, "-n", "-t", kind, "-s", value])
        .status();
    if created.is_ok_and(|status| status.success()) {
        Ok(())
    } else {
        Err(ScreensaverError(gettext(
            "Não foi possível aplicar a configuração de bloqueio de tela.",
        )))
    }
}
