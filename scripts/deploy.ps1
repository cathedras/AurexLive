<#
.SYNOPSIS
    Deploy AurexLive on Windows - build frontend and start services via PM2.
.DESCRIPTION
    Checks prerequisites, installs dependencies, builds the frontend,
    creates required directories, and starts/starts-or-reloads PM2 processes.
.PARAMETER SkipInstall
    Skip npm dependency installation.
.PARAMETER UseCiInstall
    Use npm ci (clean install) instead of npm install.
.PARAMETER Env
    PM2 environment name (production or development).
.PARAMETER ServiceInstall
    Register PM2 as a Windows service (requires admin).
#>

param(
    [switch]$SkipInstall = $false,
    [switch]$UseCiInstall = $true,
    [string]$Env = "production",
    [switch]$ServiceInstall = $false
)

$ErrorActionPreference = "Stop"
# Compatible with PowerShell 2.0+ (Windows 7 default)
$ScriptPath = $MyInvocation.MyCommand.Path
if (-not $ScriptPath) { $ScriptPath = $PSCommandPath }
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptPath)
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
Set-Location $ProjectRoot

function Log($msg) {
    Write-Host "[deploy] $msg" -ForegroundColor Cyan
}

function LogError($msg) {
    Write-Host "[deploy] ERROR: $msg" -ForegroundColor Red
}

# ----- Prerequisites Check -----
Log "Checking prerequisites..."

# Node.js
try {
    $nodeVer = node --version
    Log "Node.js $nodeVer"
} catch {
    LogError "Node.js is not installed. Download from https://nodejs.org/"
    exit 1
}

# npm
try {
    $npmVer = npm --version
    Log "npm v$npmVer"
} catch {
    LogError "npm is not available."
    exit 1
}

# ffmpeg (recommended but not strictly required for server startup)
try {
    $ffmpegVer = ffmpeg -version 2>$null
    if ($ffmpegVer) {
        Log "ffmpeg detected"
    } else {
        throw
    }
} catch {
    Log "ffmpeg not found in PATH. Install from https://ffmpeg.org/ or set FFMPEG_PATH in .env.prd"
}

# PM2
try {
    $pm2Ver = npx pm2 --version 2>$null
    Log "PM2 v$pm2Ver"
} catch {
    Log "PM2 not found, will be installed via npm."
}

# ----- Create Required Directories -----
Log "Ensuring required directories exist..."
$dirs = @(
    "uploads",
    "recordings",
    "runtime",
    "show_record",
    "frontend/dist"
)
foreach ($dir in $dirs) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Log "Created directory: $dir"
    }
}

# ----- Install Dependencies -----
if (-not $SkipInstall) {
    Log "Installing npm dependencies..."
    Push-Location $ProjectRoot
    try {
        # Win7 and older Node often have issues with npm ci/lockfiles
        npm install --legacy-peer-deps
    } finally {
        Pop-Location
    }
} else {
    Log "Skipping npm install (SkipInstall flag set)"
}

# ----- Build Frontend -----
Log "Building frontend production bundle..."
Push-Location $ProjectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
Log "Frontend build complete."

# ----- PM2 Process Management -----
Log "Starting / reloading PM2 applications..."
Push-Location $ProjectRoot
try {
    $ecosystemFile = "ecosystem.config.js"
    $env:NODE_ENV = $Env

    # Check if processes are already running (compatible with PS 2.0)
    $pm2ListRaw = npx pm2 jlist 2>$null
    $showConsoleRunning = $false
    if ($pm2ListRaw -and ($pm2ListRaw -match '"name"\s*:\s*"show-console"')) {
        $showConsoleRunning = $true
    }

    if ($showConsoleRunning) {
        Log "Reloading existing PM2 processes..."
        npx pm2 startOrReload $ecosystemFile --env $Env --update-env
    } else {
        Log "Starting PM2 processes for the first time..."
        npx pm2 start $ecosystemFile --env $Env
    }

    npx pm2 save
} finally {
    Pop-Location
}

# ----- Optional: Register as Windows Service -----
if ($ServiceInstall) {
    Log "Registering PM2 as a Windows service..."
    try {
        npx pm2-service-install
    } catch {
        LogError "PM2 service install failed. Run as Administrator and try again."
        LogError "You can manually set up with: npx pm2-service-install"
    }
}

# ----- Summary -----
Log "========================================"
Log "Deployment complete!                    "
Log "                                       "
Log "PM2 process status:                    "
npx pm2 status
Log "                                       "
Log "Service URL: http://localhost:3000      "
Log "                                       "
Log "Management commands:                   "
Log "  npx pm2 status              - View status"
Log "  npx pm2 logs                - View logs"
Log "  npx pm2 stop all           - Stop all"
Log "  npx pm2 restart all        - Restart all"
Log "  npx pm2 startup            - Auto-start on boot"
Log "========================================"
