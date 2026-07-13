//go:build windows

package eventlogs

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

const powershellTimeout = 15 * time.Second

const listScript = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
ConvertTo-Json -InputObject @(Get-WinEvent -ListLog * -ErrorAction SilentlyContinue | Where-Object {$_.IsEnabled -and $_.RecordCount -ne $null} | Sort-Object LogName | Select-Object -ExpandProperty LogName) -Compress`

const queryScript = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$f = @{LogName=[string]$p.channel}
if ($p.startTime) {$f.StartTime=[DateTime]::Parse([string]$p.startTime, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)}
if ($p.levels.Count -gt 0) {$f.Level=@($p.levels)}
$fetch=[Math]::Min([int]$p.limit*4, 2000)
$rows = @(Get-WinEvent -FilterHashtable $f -MaxEvents $fetch -ErrorAction Stop | ForEach-Object {
  try {$message=[string]$_.Message; if (-not $message) {$message='[mensagem localizada indisponível]'}} catch {$message='[mensagem localizada indisponível]'}
  [pscustomobject]@{timestamp=$_.TimeCreated.ToUniversalTime().ToString('o');provider=[string]$_.ProviderName;eventId=[int]$_.Id;level=[string]$_.LevelDisplayName;message=$message}
})
if ($p.search) {$rows = $rows | Where-Object {$_.message -like ('*'+[string]$p.search+'*')}}
ConvertTo-Json -InputObject @($rows | Select-Object -First ([int]$p.limit)) -Compress -Depth 3`

type Reader struct{}

func (Reader) ListChannels(parent context.Context) ([]string, error) {
	output, err := run(parent, listScript, nil)
	if err != nil {
		return nil, fmt.Errorf("não foi possível enumerar os canais acessíveis do Event Log: %w", err)
	}
	var channels []string
	if err := json.Unmarshal(output, &channels); err != nil {
		var single string
		if singleErr := json.Unmarshal(output, &single); singleErr == nil && single != "" {
			return []string{single}, nil
		}
		return nil, fmt.Errorf("resposta inválida do Event Log: %w", err)
	}
	return channels, nil
}

func (Reader) Query(parent context.Context, raw Query) ([]Event, error) {
	query, err := Validate(raw)
	if err != nil {
		return nil, err
	}
	input := map[string]any{"channel": query.Channel, "startTime": StartTime(query.Since, time.Now()), "levels": levels(query.Priority), "search": query.Search, "limit": query.Limit}
	payload, _ := json.Marshal(input)
	output, err := run(parent, queryScript, payload)
	if err != nil {
		return nil, fmt.Errorf("canal %q inacessível ou consulta recusada: %w", query.Channel, err)
	}
	var events []Event
	if err := json.Unmarshal(output, &events); err != nil {
		var single Event
		if singleErr := json.Unmarshal(output, &single); singleErr == nil && single.Timestamp != "" {
			return []Event{NormalizeEvent(single)}, nil
		}
		return nil, fmt.Errorf("resposta inválida do Event Log: %w", err)
	}
	for index := range events {
		events[index] = NormalizeEvent(events[index])
	}
	return events, nil
}

func run(parent context.Context, script string, input []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(parent, powershellTimeout)
	defer cancel()
	command := exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodeScript(script))
	command.Stdin = bytes.NewReader(input)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, err := command.Output()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("timeout após %s", powershellTimeout)
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

func encodeScript(script string) string {
	encoded := utf16.Encode([]rune(script))
	buffer := bytes.NewBuffer(make([]byte, 0, len(encoded)*2))
	for _, value := range encoded {
		_ = binary.Write(buffer, binary.LittleEndian, value)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

func levels(priority string) []int {
	switch priority {
	case "err":
		return []int{1, 2}
	case "warning":
		return []int{1, 2, 3}
	case "info":
		return []int{1, 2, 3, 4}
	default:
		return []int{}
	}
}
