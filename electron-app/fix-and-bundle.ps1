Add-Type -AssemblyName System.IO.Compression

$distPath = "C:\Users\kyere\Documents\codes\ephemeral-chat\electron-app\dist"
$makeappx = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"

function Fix-MSIX-Manifest($msixPath) {
    Write-Host "Fixing manifest in $([System.IO.Path]::GetFileName($msixPath))..."

    $zip = [System.IO.Compression.ZipFile]::Open($msixPath, 'Update')
    $manifestEntry = $zip.Entries | Where-Object { $_.Name -eq "AppxManifest.xml" }

    if (-not $manifestEntry) {
        Write-Host "  ERROR: No AppxManifest.xml found"
        $zip.Dispose()
        return $false
    }

    # Read manifest
    $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
    $manifest = $reader.ReadToEnd()
    $reader.Close()

    # Fix versions
    $originalLength = $manifest.Length
    $manifest = $manifest -replace 'MinVersion="10\.0\.[0-9]+"', 'MinVersion="10.0.16299.0"'
    $manifest = $manifest -replace 'MaxVersionTested="10\.0\.[0-9]+"', 'MaxVersionTested="10.0.16299.0"'

    if ($manifest.Length -eq $originalLength) {
        Write-Host "  No changes needed (already fixed)"
        $zip.Dispose()
        return $true
    }

    # Delete old and write new
    $zip.Entries | Where-Object { $_.Name -eq "AppxManifest.xml" } | ForEach-Object { $_.Delete() }

    $newEntry = $zip.CreateEntry("AppxManifest.xml")
    $writer = New-Object System.IO.StreamWriter($newEntry.Open())
    $writer.Write($manifest)
    $writer.Close()

    $zip.Dispose()
    Write-Host "  Fixed!"
    return $true
}

# Fix both MSIX files
$x64File = "$distPath\Ephemeral Chat-1.1.4-win-x64.msix"
$arm64File = "$distPath\Ephemeral Chat-1.1.4-win-arm64.msix"

if (-not (Fix-MSIX-Manifest $x64File)) { exit 1 }
if (-not (Fix-MSIX-Manifest $arm64File)) { exit 1 }

Write-Host "`nBundling..."

# Stage
$stagingDir = "$distPath\bundle-final-staging"
Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stagingDir | Out-Null
Copy-Item $x64File "$stagingDir\"
Copy-Item $arm64File "$stagingDir\"

# Bundle
$bundlePath = "$distPath\EphemeralChat-1.1.4.msixbundle"
Remove-Item $bundlePath -Force -ErrorAction SilentlyContinue

& "$makeappx" bundle /bv 1.1.4.0 /d "$stagingDir" /p "$bundlePath" /o /v | Out-Null

if (Test-Path $bundlePath) {
    $file = Get-Item $bundlePath
    Write-Host "`nSUCCESS!"
    Write-Host "  File: $($file.Name)"
    Write-Host "  Size: $([math]::Round($file.Length/1MB,2)) MB"
    Write-Host "  Ready for Microsoft Store!"
} else {
    Write-Host "`nFAILED"
    exit 1
}

# Cleanup
Remove-Item "$stagingDir" -Recurse -Force
Write-Host "`nDone!"
