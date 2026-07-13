//go:build windows

package processcontrol

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

type Controller struct{}

func (Controller) Kill(pid uint32) error { return Kill(pid) }

func Kill(pid uint32) error {
	if pid <= 4 || pid == uint32(os.Getpid()) {
		return ErrProtected
	}
	handle, err := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		if errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return ErrAccessDenied
		}
		return fmt.Errorf("abrir processo %d: %w", pid, err)
	}
	defer windows.CloseHandle(handle)

	buffer := make([]uint16, 32768)
	size := uint32(len(buffer))
	if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size); err != nil {
		if errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return ErrAccessDenied
		}
		return fmt.Errorf("identificar processo %d: %w", pid, err)
	}
	name := filepath.Base(windows.UTF16ToString(buffer[:size]))
	if IsProtectedName(name) || isProcessCritical(handle) {
		return ErrProtected
	}
	if err := windows.TerminateProcess(handle, 1); err != nil {
		if errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return ErrAccessDenied
		}
		return fmt.Errorf("encerrar processo %d: %w", pid, err)
	}
	return nil
}

func isProcessCritical(handle windows.Handle) bool {
	var critical uint32
	proc := windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessCritical")
	result, _, _ := proc.Call(uintptr(handle), uintptr(unsafe.Pointer(&critical)))
	return result != 0 && critical != 0
}
