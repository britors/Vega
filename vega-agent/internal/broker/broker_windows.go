//go:build windows

package broker

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
	"github.com/lyraos/vega-agent/internal/protocol"
	"golang.org/x/sys/windows"
)

const brokerTimeout = 90 * time.Second

type Elevator struct{ Executable string }

func (e Elevator) Proof(parent context.Context) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(parent, brokerTimeout)
	defer cancel()
	pipeName, err := randomPipeName()
	if err != nil {
		return nil, err
	}
	sid, err := currentUserSID()
	if err != nil {
		return nil, err
	}
	sddl := "D:P(D;;GA;;;NU)(A;;GRGW;;;SY)(A;;GRGW;;;BA)(A;;GRGW;;;" + sid + ")"
	listener, err := winio.ListenPipe(pipeName, &winio.PipeConfig{
		SecurityDescriptor: sddl, InputBufferSize: protocol.MaxFrameSize, OutputBufferSize: protocol.MaxFrameSize,
	})
	if err != nil {
		return nil, fmt.Errorf("create protected pipe: %w", err)
	}
	defer listener.Close()

	pid := uint32(os.Getpid())
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(pid, &sessionID); err != nil {
		return nil, err
	}
	if err := launchElevated(e.Executable, pipeName, pid, sessionID); err != nil {
		return nil, err
	}

	connection, err := acceptContext(ctx, listener)
	if err != nil {
		return nil, err
	}
	defer connection.Close()
	if err := verifyClient(connection, e.Executable, sessionID); err != nil {
		return nil, err
	}
	hello, err := protocol.Read(connection)
	if err != nil || hello.Kind != "hello" || hello.Version != protocol.Version || len(hello.Nonce) < 32 {
		return nil, fmt.Errorf("invalid broker handshake")
	}
	requestID := "elevation-proof"
	if err := protocol.Write(connection, protocol.Message{
		Version: protocol.Version, Kind: "request", RequestID: requestID, Nonce: hello.Nonce, Operation: "broker.proof",
	}); err != nil {
		return nil, err
	}
	response, err := protocol.Read(connection)
	if err != nil {
		return nil, err
	}
	if response.Kind != "result" || response.RequestID != requestID {
		return nil, fmt.Errorf("invalid broker result")
	}
	result, ok := response.Result.(map[string]any)
	if !ok {
		return map[string]any{"elevated": true}, nil
	}
	return result, nil
}

func RunClient(ctx context.Context, pipeName string, serverPID, sessionID uint32) error {
	connection, err := winio.DialPipeContext(ctx, pipeName)
	if err != nil {
		return err
	}
	defer connection.Close()
	if err := verifyServer(connection, serverPID, sessionID); err != nil {
		return err
	}
	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		return err
	}
	nonce := base64.RawURLEncoding.EncodeToString(nonceBytes)
	if err := protocol.Write(connection, protocol.Message{Version: protocol.Version, Kind: "hello", Nonce: nonce}); err != nil {
		return err
	}
	request, err := protocol.Read(connection)
	if err != nil {
		return err
	}
	if request.Version != protocol.Version || request.Nonce != nonce || request.Operation != "broker.proof" || request.RequestID == "" {
		return fmt.Errorf("unauthorized broker request")
	}
	if len(request.Params) > 0 && string(request.Params) != "{}" {
		return fmt.Errorf("broker proof takes no parameters")
	}
	return protocol.Write(connection, protocol.Message{
		Version: protocol.Version, Kind: "result", RequestID: request.RequestID,
		Result: map[string]any{"elevated": true, "pid": os.Getpid()},
	})
}

func randomPipeName() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return `\\.\pipe\Vega\` + base64.RawURLEncoding.EncodeToString(value), nil
}

func currentUserSID() (string, error) {
	token := windows.GetCurrentProcessToken()
	user, err := token.GetTokenUser()
	if err != nil {
		return "", err
	}
	return user.User.Sid.String(), nil
}

func launchElevated(executable, pipeName string, pid, sessionID uint32) error {
	verb, _ := windows.UTF16PtrFromString("runas")
	file, _ := windows.UTF16PtrFromString(executable)
	args := `--broker --pipe "` + pipeName + `" --server-pid ` + strconv.FormatUint(uint64(pid), 10) +
		` --session-id ` + strconv.FormatUint(uint64(sessionID), 10)
	arguments, _ := windows.UTF16PtrFromString(args)
	if err := windows.ShellExecute(0, verb, file, arguments, nil, windows.SW_HIDE); err != nil {
		if err == windows.ERROR_CANCELLED {
			return fmt.Errorf("UAC_CANCELED")
		}
		return fmt.Errorf("launch elevated broker: %w", err)
	}
	return nil
}

func acceptContext(ctx context.Context, listener net.Listener) (net.Conn, error) {
	type result struct {
		connection net.Conn
		err        error
	}
	ready := make(chan result, 1)
	go func() { connection, err := listener.Accept(); ready <- result{connection, err} }()
	select {
	case <-ctx.Done():
		_ = listener.Close()
		return nil, ctx.Err()
	case result := <-ready:
		return result.connection, result.err
	}
}

type handleConn interface{ Fd() uintptr }

func verifyClient(connection net.Conn, expectedPath string, sessionID uint32) error {
	handle, ok := connection.(handleConn)
	if !ok {
		return fmt.Errorf("pipe handle unavailable")
	}
	var pid uint32
	if err := windows.GetNamedPipeClientProcessId(windows.Handle(handle.Fd()), &pid); err != nil {
		return err
	}
	return verifyProcess(pid, expectedPath, sessionID, true)
}

func verifyServer(connection net.Conn, expectedPID, sessionID uint32) error {
	handle, ok := connection.(handleConn)
	if !ok {
		return fmt.Errorf("pipe handle unavailable")
	}
	var pid uint32
	if err := windows.GetNamedPipeServerProcessId(windows.Handle(handle.Fd()), &pid); err != nil {
		return err
	}
	if pid != expectedPID {
		return fmt.Errorf("unexpected pipe server")
	}
	return verifyProcess(pid, "", sessionID, false)
}

func verifyProcess(pid uint32, expectedPath string, sessionID uint32, requireElevation bool) error {
	var actualSession uint32
	if err := windows.ProcessIdToSessionId(pid, &actualSession); err != nil || actualSession != sessionID {
		return fmt.Errorf("process belongs to another session")
	}
	process, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(process)
	if expectedPath != "" {
		buffer := make([]uint16, windows.MAX_PATH)
		size := uint32(len(buffer))
		if err := windows.QueryFullProcessImageName(process, 0, &buffer[0], &size); err != nil {
			return err
		}
		actualPath := windows.UTF16ToString(buffer[:size])
		if !strings.EqualFold(filepath.Clean(actualPath), filepath.Clean(expectedPath)) {
			return fmt.Errorf("unexpected broker image")
		}
	}
	var token windows.Token
	if err := windows.OpenProcessToken(process, windows.TOKEN_QUERY, &token); err != nil {
		return err
	}
	defer token.Close()
	if requireElevation && !token.IsElevated() {
		return fmt.Errorf("broker token is not elevated")
	}
	return nil
}
