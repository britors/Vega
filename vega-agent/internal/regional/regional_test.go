package regional

import "testing"

func TestTimezoneUsesWindowsIDBoundary(t *testing.T) {
	if _, err := ValidateApply(ApplyParams{Timezone: "E. South America Standard Time", NTP: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateApply(ApplyParams{Timezone: "UTC; whoami"}); err == nil {
		t.Fatal("injection accepted")
	}
}
