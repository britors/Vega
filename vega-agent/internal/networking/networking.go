package networking

import (
	"errors"
	"net"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

type InterfaceInfo struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	State         string `json:"state"`
	IPv4          string `json:"ipv4"`
	IPv6          string `json:"ipv6"`
	Gateway       string `json:"gateway"`
	DNS           string `json:"dns"`
	MAC           string `json:"mac"`
	Speed         string `json:"speed"`
	SSID          string `json:"ssid"`
	Signal        int    `json:"signal"`
	Device        string `json:"device"`
	Autoconf      bool   `json:"autoconf"`
	Virtual       bool   `json:"virtual"`
	RemoteSession bool   `json:"remoteSession,omitempty"`
}

type WifiNetwork struct {
	SSID     string `json:"ssid"`
	Security string `json:"security"`
	Signal   int    `json:"signal"`
	Active   bool   `json:"active"`
	Device   string `json:"device"`
}
type FirewallProfile struct {
	Name     string `json:"name"`
	Enabled  bool   `json:"enabled"`
	ReadOnly bool   `json:"readOnly"`
}
type FirewallRule struct {
	Name     string `json:"name"`
	Label    string `json:"label"`
	Enabled  bool   `json:"enabled"`
	Profile  string `json:"profile"`
	ReadOnly bool   `json:"readOnly"`
}
type FirewallRuleSpec struct {
	Label     string `json:"label"`
	Direction string `json:"direction"`
	Profile   string `json:"profile"`
	Protocol  string `json:"protocol"`
	Port      uint16 `json:"port,omitempty"`
	Program   string `json:"program,omitempty"`
	Service   string `json:"service,omitempty"`
}
type ProxyConfig struct {
	HTTP        string `json:"http"`
	HTTPS       string `json:"https"`
	Socks       string `json:"socks"`
	No          string `json:"no"`
	WinHTTP     string `json:"winHttp"`
	UserEnabled bool   `json:"userEnabled"`
}
type StaticIPv4 struct {
	Interface string `json:"interface"`
	Address   string `json:"address"`
	Gateway   string `json:"gateway"`
	DNS       string `json:"dns"`
}

var interfacePattern = regexp.MustCompile(`^[\p{L}\p{N} ._()#-]{1,256}$`)
var firewallNamePattern = regexp.MustCompile(`^Vega-[A-Za-z0-9-]{1,80}$`)
var servicePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,256}$`)

func ValidateStaticIPv4(config StaticIPv4) (StaticIPv4, error) {
	config.Interface = strings.TrimSpace(config.Interface)
	if !interfacePattern.MatchString(config.Interface) {
		return StaticIPv4{}, errors.New("adaptador inválido")
	}
	prefix, err := netip.ParsePrefix(strings.TrimSpace(config.Address))
	if err != nil || !prefix.Addr().Is4() || prefix.Bits() < 1 || prefix.Bits() > 32 {
		return StaticIPv4{}, errors.New("IPv4/prefixo inválido")
	}
	config.Address = prefix.Addr().String() + "/" + strconv.Itoa(prefix.Bits())
	if config.Gateway != "" {
		ip, parseErr := netip.ParseAddr(strings.TrimSpace(config.Gateway))
		if parseErr != nil || !ip.Is4() {
			return StaticIPv4{}, errors.New("gateway IPv4 inválido")
		}
		config.Gateway = ip.String()
	}
	servers := strings.FieldsFunc(config.DNS, func(r rune) bool { return r == ',' || r == ';' || r == ' ' })
	for index, server := range servers {
		ip, err := netip.ParseAddr(server)
		if err != nil {
			return StaticIPv4{}, errors.New("servidor DNS inválido")
		}
		servers[index] = ip.String()
	}
	if len(servers) == 0 {
		return StaticIPv4{}, errors.New("ao menos um DNS é obrigatório")
	}
	config.DNS = strings.Join(servers, ",")
	return config, nil
}

func ValidateSSID(ssid, password string) error {
	if len(ssid) == 0 || len([]byte(ssid)) > 32 || !utf8.ValidString(ssid) {
		return errors.New("SSID inválido")
	}
	if password != "" && (len(password) < 8 || len(password) > 63) {
		return errors.New("senha WPA deve ter entre 8 e 63 caracteres")
	}
	return nil
}

func ValidateProxy(config ProxyConfig) error {
	for _, value := range []string{config.HTTP, config.HTTPS, config.Socks} {
		if value == "" {
			continue
		}
		if strings.ContainsAny(value, "\r\n\x00") || len(value) > 512 {
			return errors.New("proxy inválido")
		}
		if _, _, err := net.SplitHostPort(value); err != nil {
			return errors.New("proxy deve usar host:porta")
		}
	}
	return nil
}

func ValidateFirewallRule(spec FirewallRuleSpec) (FirewallRuleSpec, error) {
	spec.Label = strings.TrimSpace(spec.Label)
	if spec.Label == "" || utf8.RuneCountInString(spec.Label) > 128 || strings.ContainsAny(spec.Label, "\r\n\x00") {
		return FirewallRuleSpec{}, errors.New("nome da regra inválido")
	}
	spec.Direction = strings.ToLower(strings.TrimSpace(spec.Direction))
	if spec.Direction != "inbound" && spec.Direction != "outbound" {
		return FirewallRuleSpec{}, errors.New("direção de firewall inválida")
	}
	spec.Profile = strings.ToLower(strings.TrimSpace(spec.Profile))
	if spec.Profile != "domain" && spec.Profile != "private" && spec.Profile != "public" && spec.Profile != "any" {
		return FirewallRuleSpec{}, errors.New("perfil de firewall inválido")
	}
	spec.Protocol = strings.ToLower(strings.TrimSpace(spec.Protocol))
	if spec.Protocol != "tcp" && spec.Protocol != "udp" {
		return FirewallRuleSpec{}, errors.New("protocolo de firewall inválido")
	}
	spec.Program = strings.TrimSpace(spec.Program)
	spec.Service = strings.TrimSpace(spec.Service)
	kinds := 0
	if spec.Port != 0 {
		kinds++
	}
	if spec.Program != "" {
		kinds++
		if len(spec.Program) > 1024 || strings.ContainsAny(spec.Program, "\r\n\x00\"'`;") || !strings.Contains(spec.Program, `:\`) {
			return FirewallRuleSpec{}, errors.New("path de programa inválido")
		}
	}
	if spec.Service != "" {
		kinds++
		if !servicePattern.MatchString(spec.Service) {
			return FirewallRuleSpec{}, errors.New("serviço de firewall inválido")
		}
	}
	if kinds != 1 {
		return FirewallRuleSpec{}, errors.New("informe exatamente uma porta, programa ou serviço")
	}
	return spec, nil
}

func ValidateManagedRuleName(name string) error {
	if !firewallNamePattern.MatchString(strings.TrimSpace(name)) {
		return errors.New("regra de firewall inválida")
	}
	return nil
}
