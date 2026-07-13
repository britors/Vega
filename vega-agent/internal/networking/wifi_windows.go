//go:build windows

package networking

import (
	"context"
	"fmt"
	"html"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var wlanAPI = windows.NewLazySystemDLL("wlanapi.dll")
var (
	wlanOpenHandle              = wlanAPI.NewProc("WlanOpenHandle")
	wlanCloseHandle             = wlanAPI.NewProc("WlanCloseHandle")
	wlanEnumInterfaces          = wlanAPI.NewProc("WlanEnumInterfaces")
	wlanGetAvailableNetworkList = wlanAPI.NewProc("WlanGetAvailableNetworkList")
	wlanSetProfile              = wlanAPI.NewProc("WlanSetProfile")
	wlanConnect                 = wlanAPI.NewProc("WlanConnect")
	wlanDisconnect              = wlanAPI.NewProc("WlanDisconnect")
	wlanFreeMemory              = wlanAPI.NewProc("WlanFreeMemory")
)

type wlanInterfaceInfo struct {
	GUID        windows.GUID
	Description [256]uint16
	State       uint32
}
type dot11SSID struct {
	Length uint32
	SSID   [32]byte
}
type wlanAvailableNetwork struct {
	ProfileName [256]uint16
	SSID        dot11SSID
	BSSType     uint32
	BSSIDCount  uint32
	Connectable int32
	Reason      uint32
	PHYCount    uint32
	PHYTypes    [8]uint32
	MorePHY     int32
	Signal      uint32
	Security    int32
	Auth        uint32
	Cipher      uint32
	Flags       uint32
	Reserved    uint32
}
type wlanConnectionParameters struct {
	Mode         uint32
	Profile      *uint16
	SSID         *dot11SSID
	DesiredBSSID uintptr
	BSSType      uint32
	Flags        uint32
}

type Wifi struct{}

func (Wifi) List(ctx context.Context) ([]WifiNetwork, error) {
	handle, interfaces, closeAll, err := openWifi()
	if err != nil {
		return nil, err
	}
	defer closeAll()
	result := []WifiNetwork{}
	for _, iface := range interfaces {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		var pointer unsafe.Pointer
		code, _, _ := wlanGetAvailableNetworkList.Call(handle, uintptr(unsafe.Pointer(&iface.GUID)), 0, 0, uintptr(unsafe.Pointer(&pointer)))
		if code != 0 {
			continue
		}
		defer wlanFreeMemory.Call(uintptr(pointer))
		count := *(*uint32)(pointer)
		if count == 0 {
			continue
		}
		rows := unsafe.Slice((*wlanAvailableNetwork)(unsafe.Add(pointer, 8)), int(count))
		for _, row := range rows {
			if row.SSID.Length == 0 || row.SSID.Length > 32 {
				continue
			}
			ssid := string(row.SSID.SSID[:row.SSID.Length])
			result = append(result, WifiNetwork{SSID: ssid, Security: securityName(row), Signal: int(row.Signal), Active: row.Flags&1 != 0, Device: iface.GUID.String()})
		}
	}
	return result, nil
}

func (Wifi) Connect(ctx context.Context, ssid, password string) error {
	if err := ValidateSSID(ssid, password); err != nil {
		return err
	}
	handle, interfaces, closeAll, err := openWifi()
	if err != nil {
		return err
	}
	defer closeAll()
	for _, iface := range interfaces {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		profileName := "Vega-" + ssid
		secure := password != ""
		auth := "WPA2PSK"
		if secure {
			if network, found := findNetwork(handle, iface.GUID, ssid); found && network.Auth == 8 {
				auth = "WPA3SAE"
			}
		}
		xml := profileXML(profileName, ssid, password, auth)
		xmlPointer, _ := windows.UTF16PtrFromString(xml)
		var reason uint32
		code, _, _ := wlanSetProfile.Call(handle, uintptr(unsafe.Pointer(&iface.GUID)), 2, uintptr(unsafe.Pointer(xmlPointer)), 0, 1, 0, uintptr(unsafe.Pointer(&reason)))
		if code != 0 {
			continue
		}
		profilePointer, _ := windows.UTF16PtrFromString(profileName)
		params := wlanConnectionParameters{Mode: 0, Profile: profilePointer, BSSType: 1}
		code, _, _ = wlanConnect.Call(handle, uintptr(unsafe.Pointer(&iface.GUID)), uintptr(unsafe.Pointer(&params)), 0)
		if code == 0 {
			return nil
		}
	}
	return fmt.Errorf("não foi possível conectar à rede Wi-Fi")
}

func (Wifi) Disconnect(_ context.Context, device string) error {
	handle, interfaces, closeAll, err := openWifi()
	if err != nil {
		return err
	}
	defer closeAll()
	for _, iface := range interfaces {
		if strings.EqualFold(device, iface.GUID.String()) {
			code, _, _ := wlanDisconnect.Call(handle, uintptr(unsafe.Pointer(&iface.GUID)), 0)
			if code != 0 {
				return syscall.Errno(code)
			}
			return nil
		}
	}
	return fmt.Errorf("adaptador Wi-Fi não encontrado")
}

func openWifi() (uintptr, []wlanInterfaceInfo, func(), error) {
	var version uint32
	var handle uintptr
	code, _, _ := wlanOpenHandle.Call(2, 0, uintptr(unsafe.Pointer(&version)), uintptr(unsafe.Pointer(&handle)))
	if code != 0 {
		return 0, nil, func() {}, syscall.Errno(code)
	}
	closeAll := func() { wlanCloseHandle.Call(handle, 0) }
	var pointer unsafe.Pointer
	code, _, _ = wlanEnumInterfaces.Call(handle, 0, uintptr(unsafe.Pointer(&pointer)))
	if code != 0 {
		closeAll()
		return 0, nil, func() {}, syscall.Errno(code)
	}
	count := *(*uint32)(pointer)
	rows := []wlanInterfaceInfo{}
	if count > 0 {
		rows = append(rows, unsafe.Slice((*wlanInterfaceInfo)(unsafe.Add(pointer, 8)), int(count))...)
	}
	return handle, rows, func() { wlanFreeMemory.Call(uintptr(pointer)); closeAll() }, nil
}
func findNetwork(handle uintptr, guid windows.GUID, ssid string) (wlanAvailableNetwork, bool) {
	var pointer unsafe.Pointer
	code, _, _ := wlanGetAvailableNetworkList.Call(handle, uintptr(unsafe.Pointer(&guid)), 0, 0, uintptr(unsafe.Pointer(&pointer)))
	if code != 0 {
		return wlanAvailableNetwork{}, false
	}
	defer wlanFreeMemory.Call(uintptr(pointer))
	count := *(*uint32)(pointer)
	for _, row := range unsafe.Slice((*wlanAvailableNetwork)(unsafe.Add(pointer, 8)), int(count)) {
		if row.SSID.Length <= 32 && string(row.SSID.SSID[:row.SSID.Length]) == ssid {
			return row, true
		}
	}
	return wlanAvailableNetwork{}, false
}
func securityName(row wlanAvailableNetwork) string {
	if row.Security == 0 {
		return ""
	}
	if row.Auth == 8 {
		return "WPA3"
	}
	return "WPA2/WPA3"
}
func profileXML(name, ssid, password, auth string) string {
	e := html.EscapeString
	if password == "" {
		return `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>` + e(name) + `</name><SSIDConfig><SSID><name>` + e(ssid) + `</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM></WLANProfile>`
	}
	return `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>` + e(name) + `</name><SSIDConfig><SSID><name>` + e(ssid) + `</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>` + auth + `</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>` + e(password) + `</keyMaterial></sharedKey></security></MSM></WLANProfile>`
}
