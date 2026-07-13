package networking

import "testing"

func TestValidationCoversUnicodeAndInvalidNetworkState(t *testing.T) {
	if err := ValidateSSID("Café_日本", "senha-segura"); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateStaticIPv4(StaticIPv4{Interface: "Ethernet (Hyper-V)", Address: "192.168.10.20/24", Gateway: "192.168.10.1", DNS: "1.1.1.1, 2606:4700:4700::1111"}); err != nil {
		t.Fatal(err)
	}
	for _, value := range []StaticIPv4{{Interface: "Ethernet;whoami", Address: "10.0.0.2/24", DNS: "1.1.1.1"}, {Interface: "Ethernet", Address: "999.1.1.1/24", DNS: "1.1.1.1"}, {Interface: "Ethernet", Address: "10.0.0.2/24", DNS: "bad"}} {
		if _, err := ValidateStaticIPv4(value); err == nil {
			t.Fatalf("invalid config accepted: %#v", value)
		}
	}
}

func TestFirewallValidationUsesClosedTypedRules(t *testing.T) {
	valid, err := ValidateFirewallRule(FirewallRuleSpec{Label: "Servidor local", Direction: "Inbound", Profile: "Private", Protocol: "TCP", Port: 8080})
	if err != nil || valid.Direction != "inbound" || valid.Profile != "private" {
		t.Fatalf("valid rule rejected: %#v, %v", valid, err)
	}
	invalid := []FirewallRuleSpec{
		{Label: "Shell", Direction: "inbound", Profile: "private", Protocol: "tcp", Program: `C:\App.exe; whoami`},
		{Label: "Ambígua", Direction: "inbound", Profile: "private", Protocol: "tcp", Port: 80, Service: "Spooler"},
		{Label: "Perfil", Direction: "inbound", Profile: "GPO", Protocol: "tcp", Port: 80},
	}
	for _, spec := range invalid {
		if _, err := ValidateFirewallRule(spec); err == nil {
			t.Fatalf("invalid rule accepted: %#v", spec)
		}
	}
	if ValidateManagedRuleName("Vega-abc-123") != nil || ValidateManagedRuleName("Microsoft-Rule") == nil {
		t.Fatal("managed rule boundary failed")
	}
}
