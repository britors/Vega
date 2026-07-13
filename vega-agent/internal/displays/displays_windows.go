//go:build windows

package displays

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	displayAttached = 0x1
	displayPrimary  = 0x4
	dmPosition      = 0x20
	dmPelsWidth     = 0x80000
	dmPelsHeight    = 0x100000
	dmFrequency     = 0x400000
	currentSettings = 0xffffffff
	updateRegistry  = 0x1
	testSettings    = 0x2
	rollbackDelay   = 15 * time.Second
)

var (
	user32                    = windows.NewLazySystemDLL("user32.dll")
	procEnumDisplayDevices    = user32.NewProc("EnumDisplayDevicesW")
	procEnumDisplaySettingsEx = user32.NewProc("EnumDisplaySettingsExW")
	procChangeDisplaySettings = user32.NewProc("ChangeDisplaySettingsExW")
)

type displayDevice struct {
	Size         uint32
	DeviceName   [32]uint16
	DeviceString [128]uint16
	StateFlags   uint32
	DeviceID     [128]uint16
	DeviceKey    [128]uint16
}

type devMode struct {
	DeviceName         [32]uint16
	SpecVersion        uint16
	DriverVersion      uint16
	Size               uint16
	DriverExtra        uint16
	Fields             uint32
	PositionX          int32
	PositionY          int32
	DisplayOrientation uint32
	DisplayFixedOutput uint32
	Color              int16
	Duplex             int16
	YResolution        int16
	TTOption           int16
	Collate            int16
	FormName           [32]uint16
	LogPixels          uint16
	BitsPerPel         uint32
	PelsWidth          uint32
	PelsHeight         uint32
	DisplayFlags       uint32
	DisplayFrequency   uint32
	ICMMethod          uint32
	ICMIntent          uint32
	MediaType          uint32
	DitherType         uint32
	Reserved1          uint32
	Reserved2          uint32
	PanningWidth       uint32
	PanningHeight      uint32
}

var _ [840 - unsafe.Sizeof(displayDevice{})]byte
var _ [unsafe.Sizeof(displayDevice{}) - 840]byte
var _ [220 - unsafe.Sizeof(devMode{})]byte
var _ [unsafe.Sizeof(devMode{}) - 220]byte

type pendingChange struct {
	device string
	before devMode
	after  devMode
	timer  *time.Timer
}

type Manager struct {
	mu      sync.Mutex
	pending map[string]*pendingChange
}

func NewManager() *Manager { return &Manager{pending: map[string]*pendingChange{}} }

func (*Manager) List(context.Context) ([]Output, error) {
	rows := []Output{}
	for index := uint32(0); ; index++ {
		device := displayDevice{Size: uint32(unsafe.Sizeof(displayDevice{}))}
		ok, _, _ := procEnumDisplayDevices.Call(0, uintptr(index), uintptr(unsafe.Pointer(&device)), 0)
		if ok == 0 {
			break
		}
		name := windows.UTF16ToString(device.DeviceName[:])
		if name == "" || device.StateFlags&0x8 != 0 {
			continue
		}
		label := windows.UTF16ToString(device.DeviceString[:])
		monitor := displayDevice{Size: uint32(unsafe.Sizeof(displayDevice{}))}
		nameUTF16, _ := windows.UTF16PtrFromString(name)
		if found, _, _ := procEnumDisplayDevices.Call(uintptr(unsafe.Pointer(nameUTF16)), 0, uintptr(unsafe.Pointer(&monitor)), 0); found != 0 {
			if value := windows.UTF16ToString(monitor.DeviceString[:]); value != "" {
				label = value
			}
		}
		output := Output{Name: name, Label: label, Connected: device.StateFlags&displayAttached != 0, Primary: device.StateFlags&displayPrimary != 0, Modes: []Mode{}, HDR: "somente leitura"}
		if output.Connected {
			current, err := readMode(name, currentSettings)
			if err != nil {
				return nil, err
			}
			output.Enabled = current.PelsWidth > 0 && current.PelsHeight > 0
			output.Width, output.Height, output.X, output.Y = int(current.PelsWidth), int(current.PelsHeight), int(current.PositionX), int(current.PositionY)
			output.CurrentMode = modeID(current)
			seen := map[string]bool{}
			for modeIndex := uint32(0); ; modeIndex++ {
				mode, err := readMode(name, modeIndex)
				if err != nil {
					break
				}
				id := modeID(mode)
				if seen[id] || mode.PelsWidth == 0 || mode.PelsHeight == 0 {
					continue
				}
				seen[id] = true
				output.Modes = append(output.Modes, Mode{ID: id, Width: int(mode.PelsWidth), Height: int(mode.PelsHeight), RefreshRate: float64(mode.DisplayFrequency), Current: id == output.CurrentMode})
			}
			sort.Slice(output.Modes, func(i, j int) bool {
				if output.Modes[i].Width != output.Modes[j].Width {
					return output.Modes[i].Width > output.Modes[j].Width
				}
				if output.Modes[i].Height != output.Modes[j].Height {
					return output.Modes[i].Height > output.Modes[j].Height
				}
				return output.Modes[i].RefreshRate > output.Modes[j].RefreshRate
			})
		}
		rows = append(rows, output)
	}
	return rows, nil
}

func (m *Manager) Apply(_ context.Context, config Config) (ApplyResult, error) {
	valid, err := ValidateConfig(config)
	if err != nil {
		return ApplyResult{}, err
	}
	m.mu.Lock()
	for oldToken, pending := range m.pending {
		if pending.device == valid.Name {
			pending.timer.Stop()
			_ = changeMode(pending.device, &pending.before, 0)
			delete(m.pending, oldToken)
		}
	}
	m.mu.Unlock()
	before, err := readMode(valid.Name, currentSettings)
	if err != nil {
		return ApplyResult{}, err
	}
	width, height, frequency, err := parseMode(valid.Mode)
	if err != nil {
		return ApplyResult{}, err
	}
	if !modeExists(valid.Name, valid.Mode) {
		return ApplyResult{}, errors.New("modo de vídeo não anunciado pelo monitor")
	}
	primary, err := primaryState(valid.Name)
	if err != nil {
		return ApplyResult{}, err
	}
	if primary != valid.Primary {
		return ApplyResult{}, errors.New("alterar monitor principal ainda é somente leitura no Windows")
	}
	after := before
	after.Fields |= dmPosition | dmPelsWidth | dmPelsHeight | dmFrequency
	after.PositionX, after.PositionY = int32(valid.X), int32(valid.Y)
	after.PelsWidth, after.PelsHeight, after.DisplayFrequency = uint32(width), uint32(height), uint32(math.Round(frequency))
	if result := changeMode(valid.Name, &after, testSettings); result != 0 {
		return ApplyResult{}, fmt.Errorf("Windows rejeitou o teste da configuração de vídeo: código %d", result)
	}
	if result := changeMode(valid.Name, &after, 0); result != 0 {
		return ApplyResult{}, fmt.Errorf("Windows recusou a configuração de vídeo: código %d", result)
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		_ = changeMode(valid.Name, &before, 0)
		return ApplyResult{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	m.mu.Lock()
	entry := &pendingChange{device: valid.Name, before: before, after: after}
	entry.timer = time.AfterFunc(rollbackDelay, func() { _ = m.Revert(context.Background(), token) })
	m.pending[token] = entry
	m.mu.Unlock()
	return ApplyResult{Token: token, RollbackAfterS: int(rollbackDelay / time.Second)}, nil
}

func (m *Manager) Confirm(_ context.Context, token string) error {
	if err := ValidateToken(token); err != nil {
		return err
	}
	m.mu.Lock()
	entry := m.pending[token]
	if entry != nil {
		delete(m.pending, token)
		entry.timer.Stop()
	}
	m.mu.Unlock()
	if entry == nil {
		return errors.New("confirmação de monitor expirada")
	}
	if result := changeMode(entry.device, &entry.after, updateRegistry); result != 0 {
		_ = changeMode(entry.device, &entry.before, 0)
		return fmt.Errorf("não foi possível persistir a configuração de vídeo: código %d", result)
	}
	return nil
}

func (m *Manager) Revert(_ context.Context, token string) error {
	if err := ValidateToken(token); err != nil {
		return err
	}
	m.mu.Lock()
	entry := m.pending[token]
	if entry != nil {
		delete(m.pending, token)
		entry.timer.Stop()
	}
	m.mu.Unlock()
	if entry == nil {
		return nil
	}
	if result := changeMode(entry.device, &entry.before, 0); result != 0 {
		return fmt.Errorf("rollback de vídeo falhou: código %d", result)
	}
	return nil
}

func readMode(device string, index uint32) (devMode, error) {
	name, _ := windows.UTF16PtrFromString(device)
	mode := devMode{Size: uint16(unsafe.Sizeof(devMode{}))}
	ok, _, callErr := procEnumDisplaySettingsEx.Call(uintptr(unsafe.Pointer(name)), uintptr(index), uintptr(unsafe.Pointer(&mode)), 0)
	if ok == 0 {
		return devMode{}, callErr
	}
	return mode, nil
}

func changeMode(device string, mode *devMode, flags uint32) int32 {
	name, _ := windows.UTF16PtrFromString(device)
	result, _, _ := procChangeDisplaySettings.Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(mode)), 0, uintptr(flags), 0)
	return int32(result)
}

func modeExists(device, wanted string) bool {
	for index := uint32(0); ; index++ {
		mode, err := readMode(device, index)
		if err != nil {
			return false
		}
		if modeID(mode) == wanted {
			return true
		}
	}
}

func primaryState(name string) (bool, error) {
	for index := uint32(0); ; index++ {
		device := displayDevice{Size: uint32(unsafe.Sizeof(displayDevice{}))}
		ok, _, callErr := procEnumDisplayDevices.Call(0, uintptr(index), uintptr(unsafe.Pointer(&device)), 0)
		if ok == 0 {
			if callErr != windows.ERROR_SUCCESS {
				return false, callErr
			}
			return false, errors.New("monitor não encontrado")
		}
		if strings.EqualFold(windows.UTF16ToString(device.DeviceName[:]), name) {
			return device.StateFlags&displayPrimary != 0, nil
		}
	}
}

func modeID(mode devMode) string {
	return fmt.Sprintf("%dx%d@%d", mode.PelsWidth, mode.PelsHeight, mode.DisplayFrequency)
}
func parseMode(value string) (int, int, float64, error) {
	var width, height int
	var frequency float64
	if _, err := fmt.Sscanf(strings.Replace(value, "@", " ", 1), "%dx%d %f", &width, &height, &frequency); err != nil {
		return 0, 0, 0, errors.New("modo de vídeo inválido")
	}
	return width, height, frequency, nil
}
