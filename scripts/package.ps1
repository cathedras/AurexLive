<#
.SYNOPSIS
    Package AurexLive source code for transfer to a Windows machine.
.DESCRIPTION
    Creates a .zip archive of the project, excluding node_modules,
    runtime data, and other unnecessary directories, ready for
    deployment on a Windows server.
.PARAMETER OutputPath
    Destination path for the generated .zip file.
    Default: ../aurexlive-windows-package.zip
#>

param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $ProjectRoot

if (-not $OutputPath) {
    $OutputPath = Join-Path (Split-Path $ProjectRoot -Parent) "aurexlive-windows-package.zip"
}

$OutputPath = Resolve-Path (Split-Path $OutputPath) -ErrorAction Stop | Join-Path -ChildPath (Split-Path $OutputPath -Leaf)

function Log($msg) {
    Write-Host "[package] $msg" -ForegroundColor Cyan
}

Log "Packaging AurexLive from: $ProjectRoot"
Log "Output: $OutputPath"

# Ensure 7z or Compress-Archive is available
$use7z = $null
try {
    $null = Get-Command 7z -ErrorAction Stop
    $use7z = $true
    Log "Using 7-Zip for packaging"
} catch {
    $use7z = $false
    Log "Using Compress-Archive (built-in)"
}

$exclude = @(
    "node_modules",
    ".git",
    "runtime",
    "recordings",
    "uploads",
    "show_record",
    "frontend/dist",
    ".vscode"
)

$itemsToInclude = Get-ChildItem -Path $ProjectRoot -Exclude $exclude

if ($use7z) {
    $excludeArgs = $exclude | ForEach-Object { "-xr!$_" }
    & 7z a -tzip "`"$OutputPath`"" @excludeArgs "`"$ProjectRoot`"/*"
} else {
    Compress-Archive -Path $itemsToInclude -DestinationPath $OutputPath -CompressionLevel Optimal
}

Log "Package created successfully!"
Log "File size: $((Get-Item $OutputPath).Length / 1MB -as [int]) MB"
Log ""
Log "Next steps on Windows:"
Log "  1. Extract the zip to C:\aurexlive (or any path)"
Log "  2. Install Node.js from https://nodejs.org/"
Log "  3. Install ffmpeg from https://ffmpeg.org/ (add to PATH)"
Log "  4. Open PowerShell as Administrator in the project folder"
Log "  5. Run: .\scripts\deploy.ps1"
Log "  6. (Optional) Run: .\scripts\deploy.ps1 -ServiceInstall"
