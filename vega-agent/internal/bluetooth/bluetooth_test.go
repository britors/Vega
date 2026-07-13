package bluetooth

import "testing"

func TestValidateAddress(t *testing.T) {
	if value, err := ValidateAddress("aa:bb:cc:dd:ee:ff"); err != nil || value != "AA:BB:CC:DD:EE:FF" {
		t.Fatalf("value=%q err=%v", value, err)
	}
	for _, value := range []string{"AA:BB", "AA:BB:CC:DD:EE:FF; calc", ""} {
		if _, err := ValidateAddress(value); err == nil {
			t.Fatalf("expected rejection for %q", value)
		}
	}
}
