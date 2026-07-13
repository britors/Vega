package winget

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/lyraos/vega-agent/internal/software"
)

func TestSearchMicrosoftStoreFirst(t *testing.T) {
	calls := []string{}
	packages, err := searchMicrosoftStoreFirst(func(origin string) ([]software.PackageRef, error) {
		calls = append(calls, origin)
		return []software.PackageRef{{Origin: origin, ID: "9STORE", Name: "App da Store"}}, nil
	})
	if err != nil || len(packages) != 1 || packages[0].Origin != "msstore" {
		t.Fatalf("resultado inesperado: %#v, %v", packages, err)
	}
	if !reflect.DeepEqual(calls, []string{"msstore"}) {
		t.Fatalf("WinGet não deveria ser consultado quando a Store responde: %#v", calls)
	}
}

func TestSearchMicrosoftStoreFallsBackWhenEmptyOrUnavailable(t *testing.T) {
	for _, storeErr := range []error{nil, errors.New("origem indisponível")} {
		calls := []string{}
		packages, err := searchMicrosoftStoreFirst(func(origin string) ([]software.PackageRef, error) {
			calls = append(calls, origin)
			if origin == "msstore" {
				return nil, storeErr
			}
			return []software.PackageRef{{Origin: "winget", ID: "Vendor.App", Name: "App"}}, nil
		})
		if err != nil || len(packages) != 1 || packages[0].Origin != "winget" {
			t.Fatalf("fallback inesperado: %#v, %v", packages, err)
		}
		if !reflect.DeepEqual(calls, []string{"msstore", "winget"}) {
			t.Fatalf("ordem de fontes inesperada: %#v", calls)
		}
	}
}

func TestSearchMicrosoftStoreReportsBothFailures(t *testing.T) {
	_, err := searchMicrosoftStoreFirst(func(origin string) ([]software.PackageRef, error) {
		return nil, errors.New(origin + " falhou")
	})
	if err == nil || !strings.Contains(err.Error(), "msstore falhou") || !strings.Contains(err.Error(), "winget falhou") {
		t.Fatalf("erro combinado esperado, recebido: %v", err)
	}
}
