package agent

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
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

type fixtureElevator struct{ killed uint32 }

func (*fixtureElevator) Proof(context.Context) (map[string]any, error) {
	return map[string]any{"elevated": true}, nil
}
func (e *fixtureElevator) Kill(_ context.Context, pid uint32) error { e.killed = pid; return nil }

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
