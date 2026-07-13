//go:build windows

package localaccounts

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

const accountTimeout = 30 * time.Second

const listScript = `$ErrorActionPreference='Stop';[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$adminGroup=Get-LocalGroup -SID 'S-1-5-32-544';$admins=@(Get-LocalGroupMember -Group $adminGroup -ErrorAction SilentlyContinue|ForEach-Object{$_.SID.Value})
$local=@(Get-LocalUser|ForEach-Object{$sid=$_.SID.Value;$rid=[int]($sid.Split('-')[-1]);[pscustomobject]@{username=[string]$_.Name;sid=$sid;isAdmin=($admins -contains $sid);accountType='local';readOnly=$false;protected=($rid -in 500,501 -or $_.Name -in 'DefaultAccount','WDAGUtilityAccount')}})
$external=@(Get-CimInstance Win32_UserAccount -Filter 'LocalAccount=False' -ErrorAction SilentlyContinue|ForEach-Object{[pscustomobject]@{username=[string]$_.Caption;sid=[string]$_.SID;isAdmin=$false;accountType=if($_.Domain -eq 'MicrosoftAccount'){'microsoft'}else{'domain'};readOnly=$true;protected=$true}})
ConvertTo-Json -InputObject @($local+$external) -Compress -Depth 3`

const createScript = `$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$secure=ConvertTo-SecureString ([string]$p.password) -AsPlainText -Force;New-LocalUser -Name ([string]$p.username) -Password $secure -ErrorAction Stop|Out-Null
if([bool]$p.isAdmin){$group=Get-LocalGroup -SID 'S-1-5-32-544';Add-LocalGroupMember -Group $group -Member ([string]$p.username) -ErrorAction Stop}`

const removeScript = `$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$user=Get-LocalUser -Name ([string]$p.username) -ErrorAction Stop;$sid=$user.SID.Value;$rid=[int]($sid.Split('-')[-1]);if($rid -in 500,501 -or $user.Name -in 'DefaultAccount','WDAGUtilityAccount'){throw 'Conta interna protegida pelo Vega'}
$group=Get-LocalGroup -SID 'S-1-5-32-544';$admins=@(Get-LocalGroupMember -Group $group -ErrorAction Stop);$enabledLocal=@(Get-LocalUser|Where-Object{$_.Enabled}|ForEach-Object{$_.SID.Value});$usableAdmins=@($admins|Where-Object{$_.ObjectClass -eq 'User' -and $enabledLocal -contains $_.SID.Value});if(($admins.SID.Value -contains $sid) -and $user.Enabled -and $usableAdmins.Count -le 1){throw 'O último administrador local utilizável não pode ser removido'}
$profile=Get-CimInstance Win32_UserProfile -Filter ("SID='"+$sid+"'") -ErrorAction SilentlyContinue;Remove-LocalUser -Name $user.Name -ErrorAction Stop
if([bool]$p.removeProfile -and $profile){Remove-CimInstance -InputObject $profile -ErrorAction Stop}`

const adminScript = `$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd()|ConvertFrom-Json
$user=Get-LocalUser -Name ([string]$p.username) -ErrorAction Stop;$sid=$user.SID.Value;$rid=[int]($sid.Split('-')[-1]);if($rid -in 500,501 -or $user.Name -in 'DefaultAccount','WDAGUtilityAccount'){throw 'Conta interna protegida pelo Vega'}
$group=Get-LocalGroup -SID 'S-1-5-32-544';$admins=@(Get-LocalGroupMember -Group $group -ErrorAction Stop);$enabledLocal=@(Get-LocalUser|Where-Object{$_.Enabled}|ForEach-Object{$_.SID.Value});$usableAdmins=@($admins|Where-Object{$_.ObjectClass -eq 'User' -and $enabledLocal -contains $_.SID.Value})
if([bool]$p.isAdmin){if(-not ($admins.SID.Value -contains $sid)){Add-LocalGroupMember -Group $group -Member $user.Name -ErrorAction Stop}}
else{if($user.Enabled -and $usableAdmins.Count -le 1){throw 'O último administrador local utilizável não pode ser removido'};Remove-LocalGroupMember -Group $group -Member $user.Name -ErrorAction Stop}`

type Manager struct{}

func (Manager) List(ctx context.Context) ([]Info, error) {
	var result []Info
	err := runJSON(ctx, listScript, nil, &result)
	return result, err
}
func (Manager) Create(ctx context.Context, params CreateParams) error {
	valid, err := ValidateCreate(params)
	if err != nil {
		return err
	}
	payload, _ := json.Marshal(valid)
	_, err = runScript(ctx, createScript, payload)
	return err
}
func (Manager) Remove(ctx context.Context, params RemoveParams) error {
	username, err := ValidateUsername(params.Username)
	if err != nil {
		return err
	}
	params.Username = username
	payload, _ := json.Marshal(params)
	_, err = runScript(ctx, removeScript, payload)
	return err
}
func (Manager) SetAdmin(ctx context.Context, params AdminParams) error {
	username, err := ValidateUsername(params.Username)
	if err != nil {
		return err
	}
	params.Username = username
	payload, _ := json.Marshal(params)
	_, err = runScript(ctx, adminScript, payload)
	return err
}

func runJSON(ctx context.Context, script string, input []byte, target any) error {
	output, err := runScript(ctx, script, input)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(output, target); err != nil {
		return fmt.Errorf("resposta inválida de contas locais: %w", err)
	}
	return nil
}
func runScript(parent context.Context, script string, input []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(parent, accountTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encode(script))
	cmd.Stdin = bytes.NewReader(input)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("timeout na operação de contas locais")
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
