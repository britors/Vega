package broker

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/lyraos/vega-agent/internal/localaccounts"
	"github.com/lyraos/vega-agent/internal/networking"
	"github.com/lyraos/vega-agent/internal/protocol"
	"github.com/lyraos/vega-agent/internal/regional"
)

type fakeExecutor struct {
	calls int
	err   error
}

func (f *fakeExecutor) called() error                                           { f.calls++; return f.err }
func (f *fakeExecutor) Kill(uint32) error                                       { return f.called() }
func (f *fakeExecutor) Service(context.Context, string, string) error           { return f.called() }
func (f *fakeExecutor) StaticIPv4(context.Context, networking.StaticIPv4) error { return f.called() }
func (f *fakeExecutor) SetFirewallRule(context.Context, string, bool) error     { return f.called() }
func (f *fakeExecutor) CreateFirewallRule(context.Context, networking.FirewallRuleSpec) (string, error) {
	return "Vega-test", f.called()
}
func (f *fakeExecutor) AccountCreate(context.Context, localaccounts.CreateParams) error {
	return f.called()
}
func (f *fakeExecutor) AccountRemove(context.Context, localaccounts.RemoveParams) error {
	return f.called()
}
func (f *fakeExecutor) AccountSetAdmin(context.Context, localaccounts.AdminParams) error {
	return f.called()
}
func (f *fakeExecutor) RegionalApply(context.Context, regional.ApplyParams) error { return f.called() }

func brokerRequest(operation, params string) protocol.Message {
	return protocol.Message{Operation: operation, Params: json.RawMessage(params)}
}

func TestDispatchRejectsBeforeExecutor(t *testing.T) {
	cases := []protocol.Message{
		brokerRequest("shell.exec", `{}`),
		brokerRequest("broker.proof", `{"extra":true}`),
		brokerRequest("process.kill", `{"pid":0}`),
		brokerRequest("process.kill", `{"pid":42,"command":"whoami"}`),
		brokerRequest("services.stop", `{"name":"RpcSs"}`),
		brokerRequest("network.staticIPv4", `{"interface":"Ethernet; whoami","address":"192.0.2.2/24","dns":"1.1.1.1"}`),
		brokerRequest("network.firewallRuleSet", `{"name":"not-managed","enabled":true}`),
		brokerRequest("network.firewallRuleCreate", `{"label":"bad","direction":"inbound","profile":"private","protocol":"tcp","port":80,"command":"whoami"}`),
		brokerRequest("accounts.create", `{"username":"ana","password":"short","isAdmin":false}`),
		brokerRequest("accounts.remove", `{"username":"ana; whoami","removeProfile":false}`),
		brokerRequest("accounts.setAdmin", `{"username":"ana","isAdmin":true,"extra":1}`),
		brokerRequest("regional.apply", `{"timezone":"UTC; whoami","ntp":true}`),
	}
	for _, request := range cases {
		executor := &fakeExecutor{}
		_, _ = Dispatch(context.Background(), request, executor)
		if executor.calls != 0 {
			t.Fatalf("%s reached executor", request.Operation)
		}
	}
}

func TestDispatchExecutesValidatedRequest(t *testing.T) {
	executor := &fakeExecutor{}
	result, err := Dispatch(context.Background(), brokerRequest("process.kill", `{"pid":42}`), executor)
	if err != nil || result.Failure != nil || executor.calls != 1 || result.Values["terminated"] != true {
		t.Fatalf("result=%#v err=%v calls=%d", result, err, executor.calls)
	}
}

func TestDispatchDoesNotExposeExecutorSecrets(t *testing.T) {
	secret := "Senha-Ultra-Secreta-123"
	executor := &fakeExecutor{err: errors.New("PowerShell failed with " + secret)}
	result, err := Dispatch(context.Background(), brokerRequest("accounts.create", `{"username":"ana","password":"Senha-Ultra-Secreta-123","isAdmin":false}`), executor)
	if err != nil || result.Failure == nil {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	encoded, _ := json.Marshal(result)
	if strings.Contains(string(encoded), secret) {
		t.Fatalf("secret leaked in result: %s", encoded)
	}
}
