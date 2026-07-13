//go:build windows

package networking

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
	"unicode/utf16"
)

const scriptTimeout = 20 * time.Second

const inventoryScript = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$remote=([string]$env:SESSIONNAME -like 'RDP-*')
$rows=@(Get-NetAdapter -IncludeHidden | ForEach-Object {
  $a=$_; $ip=Get-NetIPConfiguration -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue
  $v4=@($ip.IPv4Address | ForEach-Object {$_.IPAddress+'/'+$_.PrefixLength}) -join ', '
  $v6=@($ip.IPv6Address | Where-Object {$_.IPAddress -notlike 'fe80:*'} | ForEach-Object {$_.IPAddress+'/'+$_.PrefixLength}) -join ', '
  $gw=@($ip.IPv4DefaultGateway | ForEach-Object {$_.NextHop}) -join ', '
  $dns=@(Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue | ForEach-Object {$_.ServerAddresses}) -join ', '
  [pscustomobject]@{name=[string]$a.Name;type=if($a.Virtual){'virtual'}elseif($a.NdisPhysicalMedium -eq 9){'wifi'}else{'ethernet'};state=[string]$a.Status;ipv4=$v4;ipv6=$v6;gateway=$gw;dns=$dns;mac=[string]$a.MacAddress;speed=[string]$a.LinkSpeed;ssid='';signal=0;device=[string]$a.ifIndex;autoconf=$true;virtual=[bool]$a.Virtual;remoteSession=$remote}
})
ConvertTo-Json -InputObject $rows -Compress -Depth 3`

const firewallScript = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$profiles=@(Get-NetFirewallProfile -PolicyStore ActiveStore | ForEach-Object {[pscustomobject]@{name=[string]$_.Name;enabled=[bool]$_.Enabled;readOnly=([string]$_.AllowLocalFirewallRules -eq 'False')}})
$rules=@(Get-NetFirewallRule -PolicyStore ActiveStore -TracePolicyStore | Where-Object {$_.Group -eq 'Vega'} | ForEach-Object {[pscustomobject]@{name=[string]$_.Name;label=[string]$_.DisplayName;enabled=([string]$_.Enabled -eq 'True');profile=[string]$_.Profile;readOnly=([string]$_.PolicyStoreSourceType -eq 'GroupPolicy')}})
[pscustomobject]@{profiles=$profiles;rules=$rules} | ConvertTo-Json -Compress -Depth 4`

const proxyScript = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$p=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$parts=@{}; ([string]$p.ProxyServer -split ';') | ForEach-Object {if($_ -match '^([^=]+)=(.+)$'){$parts[$matches[1]]=$matches[2]}elseif($_){$parts['http']=$_;$parts['https']=$_}}
$win=(netsh.exe winhttp show proxy) -join ' '
[pscustomobject]@{http=[string]$parts['http'];https=[string]$parts['https'];socks=[string]$parts['socks'];no=[string]$p.ProxyOverride;winHttp=$win;userEnabled=([int]$p.ProxyEnable -eq 1)} | ConvertTo-Json -Compress`

const setUserProxyScript = `$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$parts=@(); if($p.http){$parts+='http='+[string]$p.http};if($p.https){$parts+='https='+[string]$p.https};if($p.socks){$parts+='socks='+[string]$p.socks}
$path='HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
Set-ItemProperty $path ProxyServer ($parts -join ';'); Set-ItemProperty $path ProxyOverride ([string]$p.no); Set-ItemProperty $path ProxyEnable ([int]($parts.Count -gt 0))`

const staticIPv4Script = `$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$adapter=Get-NetAdapter -Name ([string]$p.interface) -ErrorAction Stop
$oldIP=@(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object IPAddress,PrefixLength)
$oldGW=@(Get-NetRoute -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object NextHop,RouteMetric)
$oldDNS=@((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4).ServerAddresses)
try {
  Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false
  Get-NetRoute -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false
  $split=([string]$p.address).Split('/'); $newArgs=@{InterfaceIndex=$adapter.ifIndex;IPAddress=$split[0];PrefixLength=([int]$split[1]);ErrorAction='Stop'};if($p.gateway){$newArgs.DefaultGateway=[string]$p.gateway};New-NetIPAddress @newArgs | Out-Null
  Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses @(([string]$p.dns).Split(',')) -Validate -ErrorAction Stop
} catch {
  Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false
  foreach($ip in $oldIP){New-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress $ip.IPAddress -PrefixLength $ip.PrefixLength -ErrorAction SilentlyContinue | Out-Null}
  foreach($route in $oldGW){New-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -NextHop $route.NextHop -RouteMetric $route.RouteMetric -ErrorAction SilentlyContinue | Out-Null}
  if($oldDNS.Count){Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses $oldDNS -ErrorAction SilentlyContinue}else{Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses -ErrorAction SilentlyContinue}
  throw
}`

const setFirewallRuleScript = `$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$rule=Get-NetFirewallRule -Name ([string]$p.name) -PolicyStore ActiveStore -TracePolicyStore -ErrorAction Stop
if([string]$rule.Group -ne 'Vega'){throw 'A regra não pertence ao Vega'}
if([string]$rule.PolicyStoreSourceType -eq 'GroupPolicy'){throw 'A regra é controlada por GPO e está em modo somente leitura'}
if([bool]$p.enabled){Enable-NetFirewallRule -Name $rule.Name -ErrorAction Stop}else{Disable-NetFirewallRule -Name $rule.Name -ErrorAction Stop}`

const createFirewallRuleScript = `$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$args=@{Name=[string]$p.name;DisplayName=[string]$p.label;Group='Vega';Direction=[string]$p.direction;Action='Allow';Profile=[string]$p.profile;Protocol=[string]$p.protocol;Enabled='True';PolicyStore='PersistentStore'}
if([int]$p.port -gt 0){$args.LocalPort=[int]$p.port}
elseif($p.program){$args.Program=[string]$p.program}
elseif($p.service){$args.Service=[string]$p.service}
else{throw 'Tipo de regra ausente'}
New-NetFirewallRule @args -ErrorAction Stop | Out-Null`

type Reader struct{}

func (Reader) Interfaces(ctx context.Context) ([]InterfaceInfo, error) {
	var value []InterfaceInfo
	return value, runJSON(ctx, inventoryScript, nil, &value)
}
func (Reader) Firewall(ctx context.Context) ([]FirewallProfile, []FirewallRule, error) {
	var value struct {
		Profiles []FirewallProfile `json:"profiles"`
		Rules    []FirewallRule    `json:"rules"`
	}
	err := runJSON(ctx, firewallScript, nil, &value)
	return value.Profiles, value.Rules, err
}
func (Reader) Proxy(ctx context.Context) (ProxyConfig, error) {
	var value ProxyConfig
	return value, runJSON(ctx, proxyScript, nil, &value)
}
func (Reader) SetUserProxy(ctx context.Context, config ProxyConfig) error {
	if err := ValidateProxy(config); err != nil {
		return err
	}
	payload, _ := json.Marshal(config)
	_, err := runScript(ctx, setUserProxyScript, payload)
	return err
}
func (Reader) ApplyStaticIPv4(ctx context.Context, config StaticIPv4) error {
	valid, err := ValidateStaticIPv4(config)
	if err != nil {
		return err
	}
	payload, _ := json.Marshal(valid)
	_, err = runScript(ctx, staticIPv4Script, payload)
	return err
}
func (Reader) SetFirewallRuleEnabled(ctx context.Context, name string, enabled bool) error {
	if err := ValidateManagedRuleName(name); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"name": name, "enabled": enabled})
	_, err := runScript(ctx, setFirewallRuleScript, payload)
	return err
}
func (Reader) CreateFirewallRule(ctx context.Context, spec FirewallRuleSpec) (string, error) {
	valid, err := ValidateFirewallRule(spec)
	if err != nil {
		return "", err
	}
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	name := "Vega-" + fmt.Sprintf("%x", value)
	payload, _ := json.Marshal(struct {
		Name string `json:"name"`
		FirewallRuleSpec
	}{Name: name, FirewallRuleSpec: valid})
	if _, err := runScript(ctx, createFirewallRuleScript, payload); err != nil {
		return "", err
	}
	return name, nil
}

func runJSON(ctx context.Context, script string, input []byte, target any) error {
	output, err := runScript(ctx, script, input)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(output, target); err != nil {
		return fmt.Errorf("resposta inválida da API de rede: %w", err)
	}
	return nil
}
func runScript(parent context.Context, script string, input []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(parent, scriptTimeout)
	defer cancel()
	command := exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShell(script))
	command.Stdin = bytes.NewReader(input)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, err := command.Output()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("timeout na operação de rede")
	}
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if len(detail) > 500 {
			detail = detail[:500]
		}
		if detail != "" {
			return nil, fmt.Errorf("%s", detail)
		}
		return nil, err
	}
	return bytes.TrimSpace(output), nil
}
func encodePowerShell(script string) string {
	values := utf16.Encode([]rune(script))
	buffer := bytes.NewBuffer(make([]byte, 0, len(values)*2))
	for _, value := range values {
		_ = binary.Write(buffer, binary.LittleEndian, value)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}
