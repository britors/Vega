package servicecontrol

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestCriticalServicePolicyAndClosedNames(t *testing.T) {
	for _, action := range []string{"stop", "restart", "disable"} {
		if err := ValidateAction("RpcSs", action); err != ErrProtected {
			t.Fatalf("%s must be protected: %v", action, err)
		}
	}
	if err := ValidateAction("Spooler", "restart"); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Spooler;whoami", `A\\B`, "", "serviço"} {
		if err := ValidateAction(name, "start"); err == nil {
			t.Fatalf("unsafe name accepted: %q", name)
		}
	}
}

func TestWaitUntilReturnsClearTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()
	err := waitUntil(ctx, time.Millisecond, func() (bool, error) { return false, nil })
	if err == nil || !strings.Contains(err.Error(), "timeout") {
		t.Fatalf("unexpected error: %v", err)
	}
}
