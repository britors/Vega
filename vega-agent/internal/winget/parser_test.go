package winget

import "testing"

func TestParseTablesInEnglishAndPortugueseWithUnicode(t *testing.T) {
	fixtures := []string{
		`Name                       Id                         Version   Source
-----------------------------------------------------------------------
Microsoft PowerToys        Microsoft.PowerToys        0.95.1    winget
Japanese 日本語 Tool       Vendor.Unicode             2.0       winget`,
		`Nome                       ID                         Versão    Fonte
-----------------------------------------------------------------------
Terminal do Windows        9N0DX20HK701               Unknown   msstore
Aplicação Ágil             Fabrica.Agil               1.2.3     winget`,
	}
	for _, fixture := range fixtures {
		rows := parseTable(fixture, false, false)
		if len(rows) != 2 {
			t.Fatalf("rows: %#v", rows)
		}
		if rows[0].ID == "" || rows[0].Origin == "" {
			t.Fatalf("invalid row: %#v", rows[0])
		}
	}
}

func TestParseUpdatesAndLocalizedDetails(t *testing.T) {
	updates := `Nome              ID                  Versão    Disponível  Fonte
-----------------------------------------------------------------
Git               Git.Git             2.40.0    2.50.0      winget`
	rows := parseTable(updates, true, true)
	if len(rows) != 1 || rows[0].Description != "2.40.0 → 2.50.0" {
		t.Fatalf("updates: %#v", rows)
	}

	english := parseDetails(`Found PowerToys [Microsoft.PowerToys]
Version: 0.95.1
Publisher: Microsoft Corporation
Description: Utilities for power users
License: MIT
Homepage: https://github.com/microsoft/PowerToys
Installer Type: wix
Scope: machine`, "winget", "Microsoft.PowerToys")
	portuguese := parseDetails(`Encontrado Ferramenta Ágil [Fabrica.Agil]
Versão: 1.2.3
Fornecedor: Fábrica São José
Descrição: Utilitário em português
Licença: Livre
Página Inicial: https://example.test/ágil
Tipo de instalador: exe
Escopo: user`, "winget", "Fabrica.Agil")
	if english.Name != "PowerToys" || english.Maintainer != "Microsoft Corporation" || english.Scopes[0] != "machine" {
		t.Fatalf("english: %#v", english)
	}
	if portuguese.Name != "Ferramenta Ágil" || portuguese.Maintainer != "Fábrica São José" || portuguese.Scopes[0] != "user" {
		t.Fatalf("portuguese: %#v", portuguese)
	}
	store := parseDetails("Found Store App [9TEST]\nAgreements:\n  Terms of Transaction: https://example.test/terms\n  Store License Terms: https://example.test/license", "msstore", "9TEST")
	if len(store.Agreements) != 2 {
		t.Fatalf("agreements: %#v", store.Agreements)
	}
}

func TestExitCodesIncludeRebootLicenseAndCancellation(t *testing.T) {
	for _, code := range []int{-1978334967, -1978335167, -1978334964} {
		if wingetError(code) == nil {
			t.Fatalf("missing mapping for %d", code)
		}
	}
}
