//go:build windows

package bluetooth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	bthprops                 = windows.NewLazySystemDLL("bthprops.cpl")
	procFindFirstRadio       = bthprops.NewProc("BluetoothFindFirstRadio")
	procFindRadioClose       = bthprops.NewProc("BluetoothFindRadioClose")
	procGetRadioInfo         = bthprops.NewProc("BluetoothGetRadioInfo")
	procIsDiscoverable       = bthprops.NewProc("BluetoothIsDiscoverable")
	procIsConnectable        = bthprops.NewProc("BluetoothIsConnectable")
	procFindFirstDevice      = bthprops.NewProc("BluetoothFindFirstDevice")
	procFindNextDevice       = bthprops.NewProc("BluetoothFindNextDevice")
	procFindDeviceClose      = bthprops.NewProc("BluetoothFindDeviceClose")
	procRemoveDevice         = bthprops.NewProc("BluetoothRemoveDevice")
	procAuthenticateDeviceEx = bthprops.NewProc("BluetoothAuthenticateDeviceEx")
)

type radioFindParams struct{ Size uint32 }
type radioInfo struct {
	Size          uint32
	_             uint32
	Address       uint64
	Name          [248]uint16
	ClassOfDevice uint32
	LMPSubversion uint16
	Manufacturer  uint16
}
type deviceSearchParams struct {
	Size                uint32
	ReturnAuthenticated uint32
	ReturnRemembered    uint32
	ReturnUnknown       uint32
	ReturnConnected     uint32
	IssueInquiry        uint32
	TimeoutMultiplier   byte
	_                   [7]byte
	Radio               windows.Handle
}
type systemTime struct{ Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds uint16 }
type deviceInfo struct {
	Size          uint32
	_             uint32
	Address       uint64
	ClassOfDevice uint32
	Connected     uint32
	Remembered    uint32
	Authenticated uint32
	LastSeen      systemTime
	LastUsed      systemTime
	Name          [248]uint16
}

var _ [520 - unsafe.Sizeof(radioInfo{})]byte
var _ [unsafe.Sizeof(radioInfo{}) - 520]byte
var _ [40 - unsafe.Sizeof(deviceSearchParams{})]byte
var _ [unsafe.Sizeof(deviceSearchParams{}) - 40]byte
var _ [560 - unsafe.Sizeof(deviceInfo{})]byte
var _ [unsafe.Sizeof(deviceInfo{}) - 560]byte

type Manager struct{}

func (Manager) Status(context.Context) (Status, error) {
	radio, closeRadio, err := firstRadio()
	if errors.Is(err, windows.ERROR_NO_MORE_ITEMS) {
		return Status{Available: false, TransferAvailable: false}, nil
	}
	if err != nil {
		return Status{}, err
	}
	defer closeRadio()
	var info radioInfo
	info.Size = uint32(unsafe.Sizeof(info))
	result, _, _ := procGetRadioInfo.Call(uintptr(radio), uintptr(unsafe.Pointer(&info)))
	if result != 0 {
		return Status{}, syscall.Errno(result)
	}
	discoverable, _, _ := procIsDiscoverable.Call(uintptr(radio))
	connectable, _, _ := procIsConnectable.Call(uintptr(radio))
	return Status{
		Available: true, Powered: true, Discoverable: discoverable != 0, Pairable: connectable != 0,
		Controller: formatAddress(info.Address), ControllerName: windows.UTF16ToString(info.Name[:]), TransferAvailable: true,
	}, nil
}

func (Manager) List(_ context.Context, inquiry bool) ([]Device, error) {
	radio, closeRadio, err := firstRadio()
	if errors.Is(err, windows.ERROR_NO_MORE_ITEMS) {
		return []Device{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer closeRadio()
	params := deviceSearchParams{
		ReturnAuthenticated: 1, ReturnRemembered: 1, ReturnUnknown: 1, ReturnConnected: 1, Radio: radio,
	}
	if inquiry {
		params.IssueInquiry, params.TimeoutMultiplier = 1, 4
	}
	params.Size = uint32(unsafe.Sizeof(params))
	var info deviceInfo
	info.Size = uint32(unsafe.Sizeof(info))
	find, _, callErr := procFindFirstDevice.Call(uintptr(unsafe.Pointer(&params)), uintptr(unsafe.Pointer(&info)))
	if find == 0 {
		if errors.Is(callErr, windows.ERROR_NO_MORE_ITEMS) || errors.Is(callErr, windows.ERROR_NOT_FOUND) {
			return []Device{}, nil
		}
		return nil, callErr
	}
	defer procFindDeviceClose.Call(find)
	rows := []Device{}
	for {
		name := windows.UTF16ToString(info.Name[:])
		rows = append(rows, Device{Address: formatAddress(info.Address), Name: name, Alias: name, Icon: deviceIcon(info.ClassOfDevice), Paired: info.Authenticated != 0 || info.Remembered != 0, Trusted: info.Authenticated != 0, Connected: info.Connected != 0})
		info = deviceInfo{Size: uint32(unsafe.Sizeof(info))}
		next, _, nextErr := procFindNextDevice.Call(find, uintptr(unsafe.Pointer(&info)))
		if next == 0 {
			if errors.Is(nextErr, windows.ERROR_NO_MORE_ITEMS) {
				break
			}
			return nil, nextErr
		}
	}
	return rows, nil
}

func (Manager) Remove(_ context.Context, address string) error {
	value, err := parseAddress(address)
	if err != nil {
		return err
	}
	result, _, _ := procRemoveDevice.Call(uintptr(unsafe.Pointer(&value)))
	if result != 0 {
		return syscall.Errno(result)
	}
	return nil
}

func (Manager) Pair(ctx context.Context, address string) error {
	valid, err := ValidateAddress(address)
	if err != nil {
		return err
	}
	rows, err := (Manager{}).List(ctx, true)
	if err != nil {
		return err
	}
	var found *Device
	for index := range rows {
		if rows[index].Address == valid {
			found = &rows[index]
			break
		}
	}
	if found == nil {
		return errors.New("dispositivo Bluetooth não encontrado; mantenha-o visível e tente novamente")
	}
	value, _ := parseAddress(valid)
	name, _ := windows.UTF16FromString(found.Name)
	var info deviceInfo
	info.Size, info.Address = uint32(unsafe.Sizeof(info)), value
	copy(info.Name[:], name)
	result, _, _ := procAuthenticateDeviceEx.Call(0, 0, uintptr(unsafe.Pointer(&info)), 0, 0)
	if result != 0 {
		return fmt.Errorf("pareamento Bluetooth: %w", syscall.Errno(result))
	}
	return nil
}

func firstRadio() (windows.Handle, func(), error) {
	params := radioFindParams{Size: uint32(unsafe.Sizeof(radioFindParams{}))}
	var radio windows.Handle
	find, _, err := procFindFirstRadio.Call(uintptr(unsafe.Pointer(&params)), uintptr(unsafe.Pointer(&radio)))
	if find == 0 {
		return 0, func() {}, err
	}
	return radio, func() { windows.CloseHandle(radio); procFindRadioClose.Call(find) }, nil
}

func parseAddress(value string) (uint64, error) {
	valid, err := ValidateAddress(value)
	if err != nil {
		return 0, err
	}
	var result uint64
	for _, part := range strings.Split(valid, ":") {
		var octet uint64
		if _, err := fmt.Sscanf(part, "%02X", &octet); err != nil {
			return 0, err
		}
		result = result<<8 | octet
	}
	return result, nil
}

func formatAddress(value uint64) string {
	return fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", byte(value>>40), byte(value>>32), byte(value>>24), byte(value>>16), byte(value>>8), byte(value))
}

func deviceIcon(class uint32) string {
	major := (class >> 8) & 0x1f
	switch major {
	case 1:
		return "computer"
	case 2:
		return "phone"
	case 4:
		return "audio-card"
	case 5:
		return "input-keyboard"
	default:
		return "bluetooth"
	}
}
