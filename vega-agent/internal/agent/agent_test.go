package agent

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/lyraos/vega-agent/internal/protocol"
)

func startTestServer(t *testing.T) (net.Conn, context.CancelFunc) {
	t.Helper()
	server, client := net.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		_ = (Server{PlatformVersion: "test"}).Serve(ctx, server, server)
		_ = server.Close()
	}()
	client.SetDeadline(time.Now().Add(2 * time.Second))
	return client, func() { cancel(); _ = client.Close() }
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
