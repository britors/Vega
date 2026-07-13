package servicecontrol

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
)

var (
	ErrProtected       = errors.New("serviço crítico protegido pelo Vega")
	serviceNamePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,256}$`)
)

var criticalServices = map[string]struct{}{
	"audiosrv": {}, "bfe": {}, "cryptsvc": {}, "dcomlaunch": {}, "dhcp": {}, "dnscache": {},
	"eventlog": {}, "lsm": {}, "mpssvc": {}, "nsi": {}, "plugplay": {}, "power": {},
	"profsvc": {}, "rpcss": {}, "samss": {}, "schedule": {}, "securityhealthservice": {},
	"windefend": {}, "winmgmt": {}, "wscsvc": {},
}

func waitUntil(ctx context.Context, interval time.Duration, ready func() (bool, error)) error {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		ok, err := ready()
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("timeout aguardando mudança de estado do serviço")
		case <-ticker.C:
		}
	}
}

var curatedServices = map[string]struct{}{
	"audiosrv": {}, "bits": {}, "dhcp": {}, "dnscache": {}, "eventlog": {},
	"mpssvc": {}, "spooler": {}, "themes": {}, "windefend": {}, "winmgmt": {},
	"wlansvc": {}, "wuauserv": {},
}

type Info struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Active      bool   `json:"active"`
	Available   bool   `json:"available"`
	StartupType string `json:"startupType"`
	ServiceType string `json:"serviceType"`
	Protected   bool   `json:"protected"`
}

func ValidateName(name string) error {
	if !serviceNamePattern.MatchString(name) {
		return errors.New("nome de serviço inválido")
	}
	return nil
}

func IsProtected(name string) bool {
	_, protected := criticalServices[strings.ToLower(name)]
	return protected
}

func IsCurated(name string) bool {
	_, curated := curatedServices[strings.ToLower(name)]
	return curated
}

func ValidateAction(name, action string) error {
	if err := ValidateName(name); err != nil {
		return err
	}
	switch action {
	case "start":
		return nil
	case "stop", "restart", "disable":
		if IsProtected(name) {
			return ErrProtected
		}
		return nil
	case "enable":
		return nil
	default:
		return errors.New("ação de serviço inválida")
	}
}
