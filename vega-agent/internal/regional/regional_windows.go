//go:build windows

package regional

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
	"unicode/utf16"
)

const regionalTimeout = 30 * time.Second
const statusScript = `$ErrorActionPreference='Stop';[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$tz=Get-TimeZone;$culture=Get-Culture;$service=Get-Service W32Time -ErrorAction SilentlyContinue
$layout=(Get-WinUserLanguageList|Select-Object -First 1).InputMethodTips -join ', '
[pscustomobject]@{timezone=[string]$tz.Id;ntp=($service -and $service.StartType -ne 'Disabled');locale=[string]$culture.Name;keymap=[string]$layout}|ConvertTo-Json -Compress`
const zonesScript = `[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false);[TimeZoneInfo]::GetSystemTimeZones().Id|ConvertTo-Json -Compress`
const applyScript = `$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd()|ConvertFrom-Json
Set-TimeZone -Id ([string]$p.timezone) -ErrorAction Stop
if([bool]$p.ntp){Set-Service W32Time -StartupType Automatic -ErrorAction Stop;Start-Service W32Time -ErrorAction SilentlyContinue;w32tm.exe /resync /nowait|Out-Null}
else{Stop-Service W32Time -ErrorAction SilentlyContinue;Set-Service W32Time -StartupType Disabled -ErrorAction Stop}`

type Manager struct{}

func (Manager) Status(ctx context.Context) (Status, error) {
	var value Status
	err := runJSON(ctx, statusScript, nil, &value)
	return value, err
}
func (Manager) Timezones(ctx context.Context) ([]string, error) {
	var value []string
	err := runJSON(ctx, zonesScript, nil, &value)
	return value, err
}
func (Manager) Apply(ctx context.Context, params ApplyParams) error {
	valid, err := ValidateApply(params)
	if err != nil {
		return err
	}
	payload, _ := json.Marshal(valid)
	_, err = runScript(ctx, applyScript, payload)
	return err
}

func runJSON(ctx context.Context, script string, input []byte, target any) error {
	output, err := runScript(ctx, script, input)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(output, target); err != nil {
		return fmt.Errorf("resposta regional inválida: %w", err)
	}
	return nil
}
func runScript(parent context.Context, script string, input []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(parent, regionalTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encode(script))
	cmd.Stdin = bytes.NewReader(input)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("timeout na operação regional")
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
func encode(script string) string {
	values := utf16.Encode([]rune(script))
	buffer := bytes.NewBuffer(make([]byte, 0, len(values)*2))
	for _, value := range values {
		_ = binary.Write(buffer, binary.LittleEndian, value)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}
