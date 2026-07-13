package processcontrol

import (
	"errors"
	"strings"
)

var (
	ErrAccessDenied = errors.New("acesso negado ao processo")
	ErrProtected    = errors.New("processo crítico protegido")
)

var criticalNames = map[string]struct{}{
	"system": {}, "registry": {}, "smss": {}, "csrss": {}, "wininit": {}, "services": {},
	"lsass": {}, "winlogon": {}, "fontdrvhost": {}, "dwm": {}, "svchost": {},
}

func IsProtectedName(name string) bool {
	_, protected := criticalNames[strings.TrimSuffix(strings.ToLower(name), ".exe")]
	return protected
}
