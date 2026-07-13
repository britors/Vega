package backup

import "testing"

func TestValidateConfigRejectsInjectionAndBadFrequency(t *testing.T) {
	for _, config := range []Config{
		{ID: `x & calc`, Paths: []string{`C:\Users\me`}, Destination: `D:\repo`, Frequency: "daily"},
		{ID: "safe", Paths: []string{`C:\Users\me`}, Destination: `D:\repo`, Frequency: "sometimes"},
	} {
		if _, err := ValidateConfig(config); err == nil {
			t.Fatalf("expected rejection: %#v", config)
		}
	}
}

func TestValidateRestoreRejectsTraversalLikeSnapshotAndUnknownMode(t *testing.T) {
	for _, params := range []RestoreParams{
		{SnapshotID: `..\secret`, TargetPath: `C:\Restore`, Mode: "separate-folder"},
		{SnapshotID: "abc123", TargetPath: `C:\Restore`, Mode: "erase-everything"},
	} {
		if _, err := ValidateRestore(params); err == nil {
			t.Fatalf("expected rejection: %#v", params)
		}
	}
}
