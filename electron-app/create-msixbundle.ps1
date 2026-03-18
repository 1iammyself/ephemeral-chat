$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$packageJson = Get-Content (Join-Path $PSScriptRoot "package.json") -Raw | ConvertFrom-Json
$version = $packageJson.version
$productName = $packageJson.build.productName

$distPath = Join-Path $PSScriptRoot "dist"
$makeappx = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"

function Process-MSIX($arch) {
    $msixFile = Join-Path $distPath "$productName-$version-win-$arch.msix"
    $workDir = Join-Path $distPath "msix-work-$arch"
    $tempMsix = Join-Path $distPath "temp-$arch.msix"

    Write-Host "Processing $arch..."

    # Clean and extract
    if (Test-Path $workDir) { Remove-Item $workDir -Recurse -Force }
    New-Item -ItemType Directory -Path $workDir

    Write-Host "  Unpacking..."
    & "$makeappx" unpack /p "$msixFile" /d "$workDir" /o
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Extract failed for $arch";
        return $false
    }

    # Fix manifest - set both to consistent versions
    $manifestPath = "$workDir\AppxManifest.xml"
    $manifest = Get-Content $manifestPath -Raw
    $manifest = $manifest -replace '(MinVersion)="[0-9.]+"', 'MinVersion="10.0.16299.0"'
    $manifest = $manifest -replace '(MaxVersionTested)="[0-9.]+"', 'MaxVersionTested="10.0.19041.0"'
    Set-Content $manifestPath -Value $manifest -Encoding UTF8

    # Repack with makeappx
    Write-Host "  Repacking..."
    if (Test-Path $tempMsix) { Remove-Item $tempMsix -Force }
    & "$makeappx" pack /d "$workDir" /p "$tempMsix" /o
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Repack failed for $arch";
        return $false
    }

    Move-Item "$tempMsix" "$msixFile" -Force
    Write-Host "  Updated: $(Split-Path $msixFile -Leaf)"
    return $true
}

# Process both architectures
if (-not (Process-MSIX "x64")) { exit 1 }
if (-not (Process-MSIX "arm64")) { exit 1 }

# Stage for bundling
Write-Host "`nPreparing bundle mapping..."
$stagingDir = "$distPath\msix-bundle-final"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Use .appx extension (makeappx is picky for bundles)
Copy-Item (Join-Path $distPath "$productName-$version-win-x64.msix") "$stagingDir\x64.appx"
Copy-Item (Join-Path $distPath "$productName-$version-win-arm64.msix") "$stagingDir\arm64.appx"

# Create mapping file
$mappingFile = "$distPath\bundle-mapping.txt"
"[Files]" | Set-Content $mappingFile
"`"$stagingDir\x64.appx`" `"x64.appx`"" | Add-Content $mappingFile
"`"$stagingDir\arm64.appx`" `"arm64.appx`"" | Add-Content $mappingFile

# Create bundle
$bundleIdentity = $packageJson.build.appx.applicationId
$bundleOutput = Join-Path $distPath "$bundleIdentity-$version.msixbundle"
Remove-Item $bundleOutput -Force -ErrorAction SilentlyContinue

Write-Host "Creating .msixbundle..."
$bundleVersion = "$version.0"
& "$makeappx" bundle /bv $bundleVersion /f "$mappingFile" /p "$bundleOutput" /o /v

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS!"
    $file = Get-Item "$bundleOutput"
    Write-Host "  $([System.IO.Path]::GetFileName($bundleOutput))"
    Write-Host "  Size: $([math]::Round($file.Length/1MB,2)) MB"
} else {
    Write-Host "`nFAILED"
    exit 1
}

# Cleanup
Write-Host "`nCleaning up..."
Remove-Item "$distPath\msix-work-*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$distPath\msix-bundle-final" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$distPath\bundle-mapping.txt" -Force -ErrorAction SilentlyContinue
Write-Host "Done!"
