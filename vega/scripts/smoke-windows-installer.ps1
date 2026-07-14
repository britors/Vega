param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$InstallDirectory = (Join-Path $env:ProgramFiles "Vega")
)

$ErrorActionPreference = "Stop"
$vega = Join-Path $InstallDirectory "Vega.exe"
$agent = Join-Path $InstallDirectory "resources\bin\vega-agent.exe"
$uninstaller = Join-Path $InstallDirectory "Uninstall Vega.exe"
$auditDirectory = Join-Path $env:ProgramData "Vega\Audit"
$process = $null

try {
  $install = Start-Process -FilePath $Installer -ArgumentList "/S" -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Instalador retornou $($install.ExitCode)" }
  foreach ($path in @($vega, $agent, $uninstaller, $auditDirectory)) {
    if (!(Test-Path $path)) { throw "Instalação incompleta, caminho ausente: $path" }
  }

  $acl = Get-Acl $auditDirectory
  if (!$acl.AreAccessRulesProtected) { throw "Diretório de auditoria ainda herda permissões" }
  foreach ($sid in @("S-1-5-18", "S-1-5-32-544")) {
    $rule = $acl.Access | Where-Object {
      $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $sid -and
      $_.AccessControlType -eq "Allow" -and
      ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl)
    }
    if (!$rule) { throw "ACL esperada ausente para $sid" }
  }

  $env:VEGA_SYSTEM_BACKEND = "mock"
  $process = Start-Process -FilePath $vega -PassThru
  Start-Sleep -Seconds 5
  if ($process.HasExited) { throw "Vega encerrou durante o smoke test com código $($process.ExitCode)" }
}
finally {
  if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force }
  Remove-Item Env:VEGA_SYSTEM_BACKEND -ErrorAction SilentlyContinue
  if (Test-Path $uninstaller) {
    $remove = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
    if ($remove.ExitCode -ne 0) { throw "Desinstalador retornou $($remove.ExitCode)" }
  }
}

if (Test-Path $agent) { throw "Agente permaneceu após desinstalação: $agent" }
if (Test-Path $vega) { throw "Vega permaneceu após desinstalação: $vega" }
Write-Host "Smoke NSIS concluído com instalação, execução e remoção válidas."
