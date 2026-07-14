param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$PackageJson = (Join-Path $PSScriptRoot "..\package.json"),
  [string]$Executable = (Join-Path $PSScriptRoot "..\dist\win-unpacked\Vega.exe")
)

$ErrorActionPreference = "Stop"
$packageVersion = (Get-Content $PackageJson -Raw | ConvertFrom-Json).version
$installerName = Split-Path $Installer -Leaf
$escapedVersion = [regex]::Escape($packageVersion)
if ($installerName -notmatch "^Vega-Setup-$escapedVersion-x64\.exe$") {
  throw "Nome do instalador não corresponde à versão $packageVersion`: $installerName"
}
if (!(Test-Path $Executable)) { throw "Executável não encontrado: $Executable" }
$productVersion = (Get-Item $Executable).VersionInfo.ProductVersion
$normalizedProductVersion = (($productVersion -split '[+-]')[0] -replace '\.0$', '')
if ($normalizedProductVersion -ne $packageVersion) {
  throw "ProductVersion $productVersion não corresponde ao package.json $packageVersion"
}
Write-Host "Versão Windows consistente: $packageVersion"
