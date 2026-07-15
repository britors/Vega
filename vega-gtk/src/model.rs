#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppIdentity {
    pub name: String,
    pub version: String,
}

impl Default for AppIdentity {
    fn default() -> Self {
        Self {
            name: "Vega".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppIdentity;

    #[test]
    fn identity_comes_from_package_metadata() {
        let identity = AppIdentity::default();
        assert_eq!(identity.name, "Vega");
        assert_eq!(identity.version, env!("CARGO_PKG_VERSION"));
    }
}
