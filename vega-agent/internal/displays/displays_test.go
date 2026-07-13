package displays

import "testing"

func TestValidateConfigRejectsInjectedMonitorAndMode(t *testing.T) {
	for _, config := range []Config{
		{Name: `\\.\DISPLAY1 & calc`, Enabled: true, Mode: "1920x1080@60"},
		{Name: `\\.\DISPLAY1`, Enabled: true, Mode: "1920x1080@60;calc"},
		{Name: `\\.\DISPLAY1`, Enabled: false, Mode: "1920x1080@60"},
	} {
		if _, err := ValidateConfig(config); err == nil {
			t.Fatalf("expected rejection: %#v", config)
		}
	}
}
