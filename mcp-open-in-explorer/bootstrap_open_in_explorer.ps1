param(
  [string]$AllowRoots = "C:\agent_sandbox",
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$BuildExe,
  [string]$ExeOutputDir = "",
  [switch]$RunStartHealthCheck,
  [int]$StartHealthCheckTimeoutSeconds = 8,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

function Log([string]$Message) {
  Write-Host "[bootstrap-open-in-explorer] $Message"
}

function Ensure-Command([string]$CommandName) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "[bootstrap-open-in-explorer][error] Missing command in PATH: $CommandName"
  }
}

function Run-Command([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "[bootstrap-open-in-explorer][error] Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
  }
}


function Invoke-StartScriptHealthCheck([string]$AllowRootValue, [int]$TimeoutSeconds) {
  $startScript = Join-Path $ScriptDirectory "start_open_in_explorer.ps1"
  if (-not (Test-Path $startScript)) {
    throw "[bootstrap-open-in-explorer][error] Missing start script: $startScript"
  }

  Log "Running start script health check..."

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $startScript,
    "-AllowRoots",
    $AllowRootValue,
    "-SkipInstall",
    "-SkipBuild",
    "-HealthCheck",
    "-HealthCheckTimeoutSeconds",
    $TimeoutSeconds.ToString(),
    "-NoPause"
  )

  Run-Command "powershell" $arguments
}

function Wait-ForExit {
  if ($NoPause) {
    return
  }

  if ($Host.Name -ne "ConsoleHost") {
    return
  }

  if ([Console]::IsInputRedirected) {
    return
  }

  Write-Host ""
  Write-Host "Press any key to exit..." -NoNewline
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  Write-Host ""
}

try {
  Set-Location $ScriptDirectory

  Ensure-Command "node"
  Ensure-Command "npm"

  $nodeVersion = (& node -v).Trim()
  $npmVersion = (& npm -v).Trim()
  Log "Node.js: $nodeVersion"
  Log "npm: $npmVersion"

  if (-not $SkipInstall) {
    Log "Installing dependencies..."
    Run-Command "npm" @("install")
  } else {
    Log "Skip npm install (-SkipInstall)."
  }

  if (-not $SkipBuild) {
    Log "Building TypeScript..."
    Run-Command "npm" @("run", "build")
  } else {
    Log "Skip build (-SkipBuild)."
  }

  if (-not (Test-Path (Join-Path $ScriptDirectory "dist/index.js"))) {
    throw "[bootstrap-open-in-explorer][error] dist/index.js not found. Please run build first."
  }

  if ($BuildExe) {
    Log "Packaging Windows EXE..."
    Run-Command "npm" @("run", "package:win-x64")

    $exePath = Join-Path $ScriptDirectory "dist/mcp-open-in-explorer-win-x64.exe"
    if (-not (Test-Path $exePath)) {
      throw "[bootstrap-open-in-explorer][error] EXE output not found: $exePath"
    }

    if (-not [string]::IsNullOrWhiteSpace($ExeOutputDir)) {
      $resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExeOutputDir)
      if (-not (Test-Path $resolvedOutput)) {
        New-Item -Path $resolvedOutput -ItemType Directory -Force | Out-Null
      }
      Copy-Item -Path $exePath -Destination (Join-Path $resolvedOutput "mcp-open-in-explorer-win-x64.exe") -Force
      Log "Copied EXE to: $resolvedOutput"
    }

    Log "EXE ready: $exePath"
  }

  if ($RunStartHealthCheck) {
    Invoke-StartScriptHealthCheck -AllowRootValue $AllowRoots -TimeoutSeconds $StartHealthCheckTimeoutSeconds
  }

  Log "Bootstrap completed."
  Log "To run from source: .\\start_open_in_explorer.ps1 -AllowRoots $AllowRoots"
  if ($BuildExe) {
    Log "To run EXE: .\\dist\\mcp-open-in-explorer-win-x64.exe $AllowRoots"
  }
}
finally {
  Wait-ForExit
}
