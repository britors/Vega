package bluetooth

import (
	"errors"
	"regexp"
	"strings"
)

type Status struct {
	Available         bool   `json:"available"`
	Powered           bool   `json:"powered"`
	Discoverable      bool   `json:"discoverable"`
	Pairable          bool   `json:"pairable"`
	Scanning          bool   `json:"scanning"`
	Controller        string `json:"controller"`
	ControllerName    string `json:"controllerName"`
	TransferAvailable bool   `json:"transferAvailable"`
	ReceiverActive    bool   `json:"receiverActive"`
	ReceivePath       string `json:"receivePath"`
}

type Device struct {
	Address   string `json:"address"`
	Name      string `json:"name"`
	Alias     string `json:"alias"`
	Icon      string `json:"icon"`
	Paired    bool   `json:"paired"`
	Trusted   bool   `json:"trusted"`
	Connected bool   `json:"connected"`
	Blocked   bool   `json:"blocked"`
	RSSI      int    `json:"rssi"`
}

var addressPattern = regexp.MustCompile(`(?i)^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$`)

func ValidateAddress(value string) (string, error) {
	value = strings.ToUpper(strings.TrimSpace(value))
	if !addressPattern.MatchString(value) {
		return "", errors.New("endereço Bluetooth inválido")
	}
	return value, nil
}
