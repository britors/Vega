package localaccounts

import "testing"

func TestAccountValidationRejectsInjectionAndWeakPassword(t *testing.T) {
	valid, err := ValidateCreate(CreateParams{Username: "José Silva", Password: "Senha-segura-123", IsAdmin: true})
	if err != nil || valid.Username != "José Silva" {
		t.Fatalf("valid account rejected: %#v %v", valid, err)
	}
	for _, params := range []CreateParams{
		{Username: "ana; whoami", Password: "Senha-segura-123"},
		{Username: "ana", Password: "curta"},
		{Username: "ana\ncmd", Password: "Senha-segura-123"},
	} {
		if _, err := ValidateCreate(params); err == nil {
			t.Fatalf("invalid account accepted: %#v", params)
		}
	}
}
