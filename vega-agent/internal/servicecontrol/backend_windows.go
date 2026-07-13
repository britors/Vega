//go:build windows

package servicecontrol

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const operationTimeout = 30 * time.Second

type Manager struct{}

func (Manager) List(ctx context.Context, all bool) ([]Info, error) {
	handle, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT|windows.SC_MANAGER_ENUMERATE_SERVICE)
	if err != nil {
		return nil, fmt.Errorf("abrir Service Control Manager: %w", err)
	}
	defer windows.CloseServiceHandle(handle)
	names, err := listWin32Services(handle)
	if err != nil {
		return nil, err
	}
	result := make([]Info, 0, len(names))
	for _, name := range names {
		if !all && !IsCurated(name) {
			continue
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		serviceHandle, openErr := windows.OpenService(handle, syscall.StringToUTF16Ptr(name), windows.SERVICE_QUERY_CONFIG|windows.SERVICE_QUERY_STATUS)
		if openErr != nil {
			continue
		}
		service := &mgr.Service{Name: name, Handle: serviceHandle}
		config, configErr := service.Config()
		status, statusErr := service.Query()
		service.Close()
		if configErr != nil || statusErr != nil || config.ServiceType&(windows.SERVICE_WIN32_OWN_PROCESS|windows.SERVICE_WIN32_SHARE_PROCESS) == 0 {
			continue
		}
		result = append(result, Info{
			Name: name, Label: fallback(config.DisplayName, name), Description: config.Description,
			Enabled: config.StartType != mgr.StartDisabled, Active: status.State == svc.Running,
			Available: true, StartupType: startupType(config.StartType), ServiceType: "win32", Protected: IsProtected(name),
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Label < result[j].Label })
	return result, nil
}

func (Manager) Apply(ctx context.Context, name, action string) error {
	if err := ValidateAction(name, action); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	scm, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT)
	if err != nil {
		return fmt.Errorf("abrir Service Control Manager: %w", err)
	}
	defer windows.CloseServiceHandle(scm)
	access := uint32(windows.SERVICE_QUERY_STATUS)
	switch action {
	case "start":
		access |= windows.SERVICE_START
	case "stop":
		access |= windows.SERVICE_STOP
	case "restart":
		access |= windows.SERVICE_STOP | windows.SERVICE_START
	case "enable", "disable":
		access |= windows.SERVICE_QUERY_CONFIG | windows.SERVICE_CHANGE_CONFIG
	}
	handle, err := windows.OpenService(scm, syscall.StringToUTF16Ptr(name), access)
	if err != nil {
		if errors.Is(err, windows.ERROR_SERVICE_DOES_NOT_EXIST) {
			return fmt.Errorf("serviço %q não existe", name)
		}
		return fmt.Errorf("abrir serviço %q: %w", name, err)
	}
	service := &mgr.Service{Name: name, Handle: handle}
	defer service.Close()
	switch action {
	case "start":
		if err := service.Start(); err != nil && !errors.Is(err, windows.ERROR_SERVICE_ALREADY_RUNNING) {
			return err
		}
		return waitState(ctx, service, svc.Running)
	case "stop":
		if _, err := service.Control(svc.Stop); err != nil && !errors.Is(err, windows.ERROR_SERVICE_NOT_ACTIVE) {
			return err
		}
		return waitState(ctx, service, svc.Stopped)
	case "restart":
		status, err := service.Query()
		if err != nil {
			return err
		}
		if status.State != svc.Stopped {
			if _, err = service.Control(svc.Stop); err != nil {
				return err
			}
			if err = waitState(ctx, service, svc.Stopped); err != nil {
				return err
			}
		}
		if err = service.Start(); err != nil {
			return err
		}
		return waitState(ctx, service, svc.Running)
	case "enable", "disable":
		config, err := service.Config()
		if err != nil {
			return err
		}
		if action == "enable" {
			config.StartType = mgr.StartAutomatic
		} else {
			config.StartType = mgr.StartDisabled
		}
		return service.UpdateConfig(config)
	}
	return errors.New("ação inválida")
}

func waitState(ctx context.Context, service *mgr.Service, wanted svc.State) error {
	return waitUntil(ctx, 250*time.Millisecond, func() (bool, error) {
		status, err := service.Query()
		return status.State == wanted, err
	})
}

func listWin32Services(handle windows.Handle) ([]string, error) {
	var needed, returned uint32
	var buffer []byte
	for {
		var pointer *byte
		if len(buffer) > 0 {
			pointer = &buffer[0]
		}
		err := windows.EnumServicesStatusEx(handle, windows.SC_ENUM_PROCESS_INFO, windows.SERVICE_WIN32, windows.SERVICE_STATE_ALL,
			pointer, uint32(len(buffer)), &needed, &returned, nil, nil)
		if err == nil {
			break
		}
		if !errors.Is(err, syscall.ERROR_MORE_DATA) {
			return nil, fmt.Errorf("enumerar serviços: %w", err)
		}
		buffer = make([]byte, needed)
	}
	if returned == 0 {
		return []string{}, nil
	}
	rows := unsafe.Slice((*windows.ENUM_SERVICE_STATUS_PROCESS)(unsafe.Pointer(&buffer[0])), int(returned))
	names := make([]string, 0, returned)
	for _, row := range rows {
		names = append(names, windows.UTF16PtrToString(row.ServiceName))
	}
	return names, nil
}

func fallback(value, other string) string {
	if value != "" {
		return value
	}
	return other
}
func startupType(value uint32) string {
	switch value {
	case mgr.StartAutomatic:
		return "automatic"
	case mgr.StartManual:
		return "manual"
	case mgr.StartDisabled:
		return "disabled"
	default:
		return "other"
	}
}
