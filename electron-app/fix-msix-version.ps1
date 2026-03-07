param (
    [Parameter(Mandatory=$true)]
    [string]$MsixFile
)

$ErrorActionPreference = "Stop"

$TempDir = Join-Path (Get-Location) "temp_msix_fix"
$OutputFile = $MsixFile -replace '\.msix$', '-fixed.msix'
$MakeAppxPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"

Write-Host "Fixing MinVersion in $MsixFile..."

if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}
New-Item -ItemType Directory -Path $TempDir | Out-Null

Write-Host "Unpacking with makeappx..."
& $MakeAppxPath unpack /p $MsixFile /d $TempDir /o | Out-Null

$ManifestPath = Join-Path $TempDir "AppxManifest.xml"
$ManifestContent = Get-Content -Path $ManifestPath -Raw
$ManifestContent = $ManifestContent -replace 'MinVersion="[^"]+"', 'MinVersion="10.0.19041.0"'
$ManifestContent = $ManifestContent -replace 'MaxVersionTested="[^"]+"', 'MaxVersionTested="10.0.22621.0"'
Set-Content -Path $ManifestPath -Value $ManifestContent -Encoding UTF8

Write-Host "Updated MinVersion to 10.0.19041.0"
Write-Host "Repackaging with makeappx..."

& $MakeAppxPath pack /d $TempDir /p $OutputFile /o | Out-Null

if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}

Write-Host "Created: $OutputFile"
Write-Host "Done!"
