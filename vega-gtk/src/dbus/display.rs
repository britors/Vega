use async_trait::async_trait;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DisplayMode {
    pub width: u32,
    pub height: u32,
    pub refresh_hz: f64,
    pub current: bool,
    pub preferred: bool,
}

impl From<(u32, u32, f64, bool, bool)> for DisplayMode {
    fn from(row: (u32, u32, f64, bool, bool)) -> Self {
        Self {
            width: row.0,
            height: row.1,
            refresh_hz: row.2,
            current: row.3,
            preferred: row.4,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct DisplayOutput {
    pub name: String,
    pub enabled: bool,
    pub primary: bool,
    pub scale: f64,
    pub rotation: String,
    pub modes: Vec<DisplayMode>,
}

type DisplayOutputRow = (
    String,
    bool,
    bool,
    f64,
    String,
    Vec<(u32, u32, f64, bool, bool)>,
);

impl From<DisplayOutputRow> for DisplayOutput {
    fn from(row: DisplayOutputRow) -> Self {
        Self {
            name: row.0,
            enabled: row.1,
            primary: row.2,
            scale: row.3,
            rotation: row.4,
            modes: row.5.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DisplayClientError(String);

impl std::fmt::Display for DisplayClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            gettextrs::gettext("interface de tela indisponível: {detail}")
                .replace("{detail}", &self.0)
        )
    }
}

impl std::error::Error for DisplayClientError {}

impl DisplayClientError {
    fn from_error(error: impl std::fmt::Display) -> Self {
        Self(error.to_string())
    }
}

#[async_trait]
pub trait DisplayClient: Send + Sync {
    async fn list_outputs(&self) -> Result<Vec<DisplayOutput>, DisplayClientError>;
    #[allow(clippy::too_many_arguments)]
    async fn apply(
        &self,
        output: &str,
        width: u32,
        height: u32,
        refresh_hz: f64,
        scale: f64,
        rotation: &str,
    ) -> Result<(), DisplayClientError>;
}

#[zbus::proxy(
    interface = "org.lyraos.Vega1.Display",
    default_service = "org.lyraos.Vega1",
    default_path = "/org/lyraos/Vega1"
)]
trait Display {
    async fn list_outputs(&self) -> zbus::Result<Vec<DisplayOutputRow>>;
    #[allow(clippy::too_many_arguments)]
    async fn apply(
        &self,
        output: &str,
        width: u32,
        height: u32,
        refresh_hz: f64,
        scale: f64,
        rotation: &str,
    ) -> zbus::Result<()>;
}

pub struct ZbusDisplayClient {
    connection: zbus::Connection,
}

impl ZbusDisplayClient {
    pub fn from_connection(connection: zbus::Connection) -> Self {
        Self { connection }
    }

    async fn proxy(&self) -> Result<DisplayProxy<'_>, DisplayClientError> {
        DisplayProxy::new(&self.connection)
            .await
            .map_err(DisplayClientError::from_error)
    }
}

macro_rules! call {
    ($self:ident, $method:ident ( $($arg:expr),* $(,)? )) => {
        $self.proxy().await?.$method($($arg),*).await.map_err(DisplayClientError::from_error)
    };
}

#[async_trait]
impl DisplayClient for ZbusDisplayClient {
    async fn list_outputs(&self) -> Result<Vec<DisplayOutput>, DisplayClientError> {
        call!(self, list_outputs())
            .map(|rows: Vec<DisplayOutputRow>| rows.into_iter().map(Into::into).collect())
    }
    async fn apply(
        &self,
        output: &str,
        width: u32,
        height: u32,
        refresh_hz: f64,
        scale: f64,
        rotation: &str,
    ) -> Result<(), DisplayClientError> {
        call!(
            self,
            apply(output, width, height, refresh_hz, scale, rotation)
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn display_xml_contains_every_typed_method() {
        let xml = include_str!("../../../dbus/org.lyraos.Vega1.Display.xml");
        for method in ["ListOutputs", "Apply"] {
            assert!(xml.contains(&format!("<method name=\"{method}\">")));
        }
    }
}
