package agent

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/lyraos/vega-agent/internal/eventlogs"
	"github.com/lyraos/vega-agent/internal/localaccounts"
	"github.com/lyraos/vega-agent/internal/networking"
	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
	"github.com/lyraos/vega-agent/internal/regional"
	"github.com/lyraos/vega-agent/internal/servicecontrol"
	"github.com/lyraos/vega-agent/internal/software"
)

func startTestServer(t *testing.T) (net.Conn, context.CancelFunc) {
	return startConfiguredTestServer(t, Server{PlatformVersion: "test"})
}

func startConfiguredTestServer(t *testing.T, configured Server) (net.Conn, context.CancelFunc) {
	t.Helper()
	server, client := net.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		_ = configured.Serve(ctx, server, server)
		_ = server.Close()
	}()
	client.SetDeadline(time.Now().Add(2 * time.Second))
	return client, func() { cancel(); _ = client.Close() }
}

type fixtureCollector struct{}

func (fixtureCollector) SystemInfo(context.Context) (map[string]any, error) {
	return map[string]any{"name": "Windows 11 Pro", "build": "26100"}, nil
}
func (fixtureCollector) DiskUsage(context.Context) (DiskUsage, error) {
	return DiskUsage{Used: "10 GiB", Total: "100 GiB", Percent: 10}, nil
}
func (fixtureCollector) HardwareInventory(context.Context) (HardwareInventory, error) {
	return HardwareInventory{CPU: "Ryzen", GPU: "Vídeo", RAMText: "16 GiB", Manufacturer: "Fábrica"}, nil
}
func (fixtureCollector) FirmwareStatus(context.Context) (string, error) { return "UEFI 1.0", nil }
func (fixtureCollector) SystemMetrics(context.Context) (SystemMetrics, error) {
	return SystemMetrics{CPUPercent: 12.5, MemTotal: 16 << 30}, nil
}
func (fixtureCollector) ListProcesses(context.Context) ([]ProcessInfo, error) {
	return []ProcessInfo{{PID: 42, Name: "Aplicação", User: `DOMÍNIO\josé`, Protected: false}}, nil
}
func (fixtureCollector) ListStorageVolumes(context.Context) ([]StorageVolumeInfo, error) {
	return []StorageVolumeInfo{{Name: "Dados_日本", Path: "D:", FSType: "NTFS", Health: "Healthy"}}, nil
}

type fixtureProcesses struct{}

func (fixtureProcesses) Kill(pid uint32) error {
	if pid == 4 {
		return processcontrol.ErrProtected
	}
	if pid == 99 {
		return processcontrol.ErrAccessDenied
	}
	return nil
}

type fixtureElevator struct {
	killed                     uint32
	serviceName, serviceAction string
}

func (*fixtureElevator) Proof(context.Context) (map[string]any, error) {
	return map[string]any{"elevated": true}, nil
}
func (e *fixtureElevator) Kill(_ context.Context, pid uint32) error { e.killed = pid; return nil }
func (e *fixtureElevator) Service(_ context.Context, name, action string) error {
	if name == "MissingService" {
		return errors.New(`serviço "MissingService" não existe`)
	}
	e.serviceName, e.serviceAction = name, action
	return nil
}
func (*fixtureElevator) StaticIPv4(context.Context, networking.StaticIPv4) error { return nil }
func (*fixtureElevator) SetFirewallRule(context.Context, string, bool) error     { return nil }
func (*fixtureElevator) CreateFirewallRule(context.Context, networking.FirewallRuleSpec) (string, error) {
	return "Vega-test", nil
}
func (*fixtureElevator) AccountCreate(context.Context, localaccounts.CreateParams) error  { return nil }
func (*fixtureElevator) AccountRemove(context.Context, localaccounts.RemoveParams) error  { return nil }
func (*fixtureElevator) AccountSetAdmin(context.Context, localaccounts.AdminParams) error { return nil }
func (*fixtureElevator) RegionalApply(context.Context, regional.ApplyParams) error        { return nil }

type fixtureServices struct{}

func (fixtureServices) List(_ context.Context, all bool) ([]servicecontrol.Info, error) {
	return []servicecontrol.Info{{Name: "Spooler", Label: "Spooler", Active: all, Available: true}}, nil
}

type fixtureEventLogs struct{}

func (fixtureEventLogs) ListChannels(context.Context) ([]string, error) {
	return []string{"Application", "System"}, nil
}

type fixtureNetwork struct{}

func (fixtureNetwork) Interfaces(context.Context) ([]networking.InterfaceInfo, error) {
	return []networking.InterfaceInfo{{Name: "Ethernet_日本", IPv4: "192.0.2.10/24"}}, nil
}
func (fixtureNetwork) Firewall(context.Context) ([]networking.FirewallProfile, []networking.FirewallRule, error) {
	return []networking.FirewallProfile{{Name: "Private", Enabled: true}}, []networking.FirewallRule{{Name: "Vega-test", Label: "Teste", Enabled: true}}, nil
}
func (fixtureNetwork) Proxy(context.Context) (networking.ProxyConfig, error) {
	return networking.ProxyConfig{HTTP: "proxy.test:8080"}, nil
}
func (fixtureNetwork) SetUserProxy(context.Context, networking.ProxyConfig) error { return nil }

type fixtureWifi struct{}

func (fixtureWifi) List(context.Context) ([]networking.WifiNetwork, error) {
	return []networking.WifiNetwork{{SSID: "Café_日本", Signal: 90}}, nil
}
func (fixtureWifi) Connect(context.Context, string, string) error { return nil }
func (fixtureWifi) Disconnect(context.Context, string) error      { return nil }

type fixtureAccounts struct{}

func (fixtureAccounts) List(context.Context) ([]localaccounts.Info, error) {
	return []localaccounts.Info{{Username: "José", SID: "S-1-5-21-1", IsAdmin: true, AccountType: "local"}}, nil
}

type fixtureRegional struct{}

func (fixtureRegional) Status(context.Context) (regional.Status, error) {
	return regional.Status{Timezone: "E. South America Standard Time", NTP: true, Locale: "pt-BR"}, nil
}
func (fixtureRegional) Timezones(context.Context) ([]string, error) {
	return []string{"UTC", "E. South America Standard Time"}, nil
}
func (fixtureEventLogs) Query(_ context.Context, query eventlogs.Query) ([]eventlogs.Event, error) {
	return []eventlogs.Event{{Timestamp: "2026-01-01T00:00:00Z", Provider: "Teste", EventID: 42, Level: "Information", Message: "mensagem 日本語 " + query.Channel}}, nil
}

type fixtureSoftware struct{ mutation software.Mutation }

func (*fixtureSoftware) Version(context.Context) (string, error) { return "v1.test", nil }
func (*fixtureSoftware) Search(_ context.Context, query string) ([]software.PackageRef, error) {
	return []software.PackageRef{{Origin: "winget", ID: "Fábrica.App", Name: query}}, nil
}
func (*fixtureSoftware) ListInstalled(context.Context) ([]software.PackageRef, error) {
	return []software.PackageRef{}, nil
}
func (*fixtureSoftware) ListUpdates(context.Context) ([]software.PackageRef, error) {
	return []software.PackageRef{}, nil
}
func (*fixtureSoftware) Details(_ context.Context, origin, id string) (software.PackageDetails, error) {
	return software.PackageDetails{Origin: origin, ID: id, Name: "Aplicação"}, nil
}
func (f *fixtureSoftware) Mutate(_ context.Context, mutation software.Mutation, progress software.Progress) (software.MutationResult, error) {
	f.mutation = mutation
	progress(50, "Instalando")
	return software.MutationResult{Message: "Concluído"}, nil
}

func request(t *testing.T, conn net.Conn, hello protocol.Message, id, operation string, params []byte) protocol.Message {
	t.Helper()
	if err := protocol.Write(conn, protocol.Message{Version: protocol.Version, Kind: "request", RequestID: id, Nonce: hello.Nonce, Operation: operation, Params: params}); err != nil {
		t.Fatal(err)
	}
	response, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func handshake(t *testing.T, conn net.Conn) protocol.Message {
	t.Helper()
	if err := protocol.Write(conn, protocol.Message{Version: protocol.Version, Kind: "hello", RequestID: "hello-1"}); err != nil {
		t.Fatal(err)
	}
	response, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if response.Kind != "hello" || response.Nonce == "" {
		t.Fatalf("invalid hello: %#v", response)
	}
	return response
}

func TestHandshakePingAndUnknownOperation(t *testing.T) {
	conn, closeServer := startTestServer(t)
	defer closeServer()
	hello := handshake(t, conn)

	if err := protocol.Write(conn, protocol.Message{
		Version: protocol.Version, Kind: "request", RequestID: "ping-1", Nonce: hello.Nonce, Operation: "system.ping",
	}); err != nil {
		t.Fatal(err)
	}
	result, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != "result" {
		t.Fatalf("got %#v", result)
	}

	if err := protocol.Write(conn, protocol.Message{
		Version: protocol.Version, Kind: "request", RequestID: "unknown-1", Nonce: hello.Nonce, Operation: "shell.exec",
	}); err != nil {
		t.Fatal(err)
	}
	result, err = protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if result.Error == nil || result.Error.Code != "UNSUPPORTED" {
		t.Fatalf("got %#v", result)
	}
}

func TestRejectsReplayAndWrongNonce(t *testing.T) {
	conn, closeServer := startTestServer(t)
	defer closeServer()
	hello := handshake(t, conn)
	request := protocol.Message{
		Version: protocol.Version, Kind: "request", RequestID: "same-id", Nonce: hello.Nonce, Operation: "system.ping",
	}
	if err := protocol.Write(conn, request); err != nil {
		t.Fatal(err)
	}
	if _, err := protocol.Read(conn); err != nil {
		t.Fatal(err)
	}
	if err := protocol.Write(conn, request); err != nil {
		t.Fatal(err)
	}
	replay, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if replay.Error == nil || replay.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("got %#v", replay)
	}

	request.RequestID = "wrong-nonce"
	request.Nonce = "not-the-session-nonce"
	if err := protocol.Write(conn, request); err != nil {
		t.Fatal(err)
	}
	wrongNonce, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if wrongNonce.Error == nil || wrongNonce.Error.Code != "PROTOCOL_MISMATCH" {
		t.Fatalf("got %#v", wrongNonce)
	}
}

func TestRejectsParametersForPing(t *testing.T) {
	conn, closeServer := startTestServer(t)
	defer closeServer()
	hello := handshake(t, conn)
	if err := protocol.Write(conn, protocol.Message{
		Version: protocol.Version, Kind: "request", RequestID: "params", Nonce: hello.Nonce,
		Operation: "system.ping", Params: []byte(`{"extra":true}`),
	}); err != nil {
		t.Fatal(err)
	}
	response, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if response.Error == nil || response.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("got %#v", response)
	}
}

func TestReadCollectorsAndUnicodeFixtures(t *testing.T) {
	conn, closeServer := startConfiguredTestServer(t, Server{PlatformVersion: "test", Collector: fixtureCollector{}})
	defer closeServer()
	hello := handshake(t, conn)
	capabilities := hello.Result.(map[string]any)
	if capabilities["platform"] != "windows" {
		t.Fatalf("capabilities: %#v", capabilities)
	}

	for index, operation := range []string{"system.diskUsage", "hardware.inventory", "hardware.firmwareStatus", "monitor.metrics", "monitor.processes", "storage.volumes"} {
		response := request(t, conn, hello, string(rune('a'+index)), operation, nil)
		if response.Kind != "result" {
			t.Fatalf("%s: %#v", operation, response)
		}
	}
}

func TestKillProtectsCriticalAndElevatesOnlyAccessDenied(t *testing.T) {
	elevator := &fixtureElevator{}
	conn, closeServer := startConfiguredTestServer(t, Server{PlatformVersion: "test", Processes: fixtureProcesses{}, Elevator: elevator})
	defer closeServer()
	hello := handshake(t, conn)

	protected := request(t, conn, hello, "protected", "process.kill", []byte(`{"pid":4}`))
	if protected.Error == nil || protected.Error.Code != "UNAUTHORIZED" {
		t.Fatalf("protected: %#v", protected)
	}
	if elevator.killed != 0 {
		t.Fatal("protected process reached elevator")
	}

	elevated := request(t, conn, hello, "elevated", "process.kill", []byte(`{"pid":99}`))
	if elevated.Kind != "result" || elevator.killed != 99 {
		t.Fatalf("elevated: %#v, pid=%d", elevated, elevator.killed)
	}

	direct := request(t, conn, hello, "direct", "process.kill", []byte(`{"pid":42}`))
	if direct.Kind != "result" || elevator.killed != 99 {
		t.Fatalf("direct: %#v, pid=%d", direct, elevator.killed)
	}

	invalid := request(t, conn, hello, "invalid", "process.kill", []byte(`{"pid":42,"command":"whoami"}`))
	if invalid.Error == nil || invalid.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("invalid: %#v", invalid)
	}
}

func TestSoftwareUsesClosedParametersAndStreamsProgress(t *testing.T) {
	manager := &fixtureSoftware{}
	conn, closeServer := startConfiguredTestServer(t, Server{PlatformVersion: "test", Software: manager})
	defer closeServer()
	hello := handshake(t, conn)

	result := request(t, conn, hello, "search", "software.search", []byte(`{"query":"Ágil 日本"}`))
	if result.Kind != "result" {
		t.Fatalf("search: %#v", result)
	}

	if err := protocol.Write(conn, protocol.Message{
		Version: protocol.Version, Kind: "request", RequestID: "install", Nonce: hello.Nonce,
		Operation: "software.install", Params: []byte(`{"origin":"winget","id":"Fábrica.App","scope":"user","acceptAgreements":true}`),
	}); err != nil {
		t.Fatal(err)
	}
	progress, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	finished, err := protocol.Read(conn)
	if err != nil {
		t.Fatal(err)
	}
	if progress.Kind != "progress" || finished.Kind != "result" {
		t.Fatalf("progress=%#v result=%#v", progress, finished)
	}
	if manager.mutation.ID != "Fábrica.App" || manager.mutation.Scope != "user" || !manager.mutation.AcceptAgreements {
		t.Fatalf("mutation: %#v", manager.mutation)
	}

	invalid := request(t, conn, hello, "injection", "software.install", []byte(`{"origin":"winget","id":"Safe.App","scope":"user","acceptAgreements":true,"args":["--override","cmd"]}`))
	if invalid.Error == nil || invalid.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("invalid: %#v", invalid)
	}
}

func TestServicesAndEventLogUseClosedContracts(t *testing.T) {
	elevator := &fixtureElevator{}
	conn, closeServer := startConfiguredTestServer(t, Server{PlatformVersion: "test", Services: fixtureServices{}, EventLogs: fixtureEventLogs{}, Elevator: elevator})
	defer closeServer()
	hello := handshake(t, conn)

	if result := request(t, conn, hello, "services", "services.list", nil); result.Kind != "result" {
		t.Fatalf("services: %#v", result)
	}
	if result := request(t, conn, hello, "logs", "eventlog.query", []byte(`{"channel":"System","priority":"warning","since":"-1hour","search":"日本","limit":50}`)); result.Kind != "result" {
		t.Fatalf("logs: %#v", result)
	}
	if result := request(t, conn, hello, "service", "services.restart", []byte(`{"name":"Spooler"}`)); result.Kind != "result" || elevator.serviceName != "Spooler" || elevator.serviceAction != "restart" {
		t.Fatalf("service mutation: %#v / %#v", result, elevator)
	}

	protected := request(t, conn, hello, "protected-service", "services.stop", []byte(`{"name":"RpcSs"}`))
	if protected.Error == nil || protected.Error.Code != "UNAUTHORIZED" || elevator.serviceName != "Spooler" {
		t.Fatalf("protected: %#v / %#v", protected, elevator)
	}
	injected := request(t, conn, hello, "injected-channel", "eventlog.query", []byte(`{"channel":"System'; whoami","priority":"","since":"","search":"","limit":50}`))
	if injected.Error == nil || injected.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("injection: %#v", injected)
	}
	missing := request(t, conn, hello, "missing-service", "services.start", []byte(`{"name":"MissingService"}`))
	if missing.Error == nil || missing.Error.Code != "EXTERNAL_FAILURE" {
		t.Fatalf("missing service: %#v", missing)
	}
}

func TestNetworkUsesClosedContractsAndKeepsWifiPasswordOutOfResults(t *testing.T) {
	elevator := &fixtureElevator{}
	conn, closeServer := startConfiguredTestServer(t, Server{PlatformVersion: "test", Network: fixtureNetwork{}, Wifi: fixtureWifi{}, Elevator: elevator})
	defer closeServer()
	hello := handshake(t, conn)

	for index, operation := range []string{"network.interfaces", "network.wifi", "network.proxy", "network.firewall"} {
		if result := request(t, conn, hello, "network-read-"+string(rune('a'+index)), operation, nil); result.Kind != "result" {
			t.Fatalf("%s: %#v", operation, result)
		}
	}
	connected := request(t, conn, hello, "wifi-connect", "network.wifiConnect", []byte(`{"ssid":"Café_日本","password":"senha-segura"}`))
	if connected.Kind != "result" {
		t.Fatalf("wifi: %#v", connected)
	}
	invalid := request(t, conn, hello, "network-injection", "network.staticIPv4", []byte(`{"interface":"Ethernet","address":"192.0.2.2/24","gateway":"192.0.2.1","dns":"1.1.1.1","command":"whoami"}`))
	if invalid.Error == nil || invalid.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("injection: %#v", invalid)
	}
	created := request(t, conn, hello, "firewall-create", "network.firewallRuleCreate", []byte(`{"label":"Servidor","direction":"inbound","profile":"private","protocol":"tcp","port":8080}`))
	if created.Kind != "result" {
		t.Fatalf("firewall: %#v", created)
	}
}

func TestAccountsAndRegionalRejectWeakOrInjectedParameters(t *testing.T) {
	conn, closeServer := startConfiguredTestServer(t, Server{
		PlatformVersion: "test", Accounts: fixtureAccounts{}, Regional: fixtureRegional{}, Elevator: &fixtureElevator{},
	})
	defer closeServer()
	hello := handshake(t, conn)
	if result := request(t, conn, hello, "accounts-list", "accounts.list", nil); result.Kind != "result" {
		t.Fatalf("accounts: %#v", result)
	}
	if result := request(t, conn, hello, "regional-status", "regional.status", nil); result.Kind != "result" {
		t.Fatalf("regional: %#v", result)
	}
	weak := request(t, conn, hello, "weak-password", "accounts.create", []byte(`{"username":"ana","password":"curta","isAdmin":false}`))
	if weak.Error == nil || weak.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("weak: %#v", weak)
	}
	injected := request(t, conn, hello, "timezone-injection", "regional.apply", []byte(`{"timezone":"UTC; whoami","ntp":true}`))
	if injected.Error == nil || injected.Error.Code != "INVALID_ARGUMENT" {
		t.Fatalf("timezone: %#v", injected)
	}
}
