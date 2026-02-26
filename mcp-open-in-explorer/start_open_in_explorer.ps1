param(
  [string[]]$AllowRoots = @("C:\agent_sandbox"),
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

function Log([string]$Message) {
  Write-Host "[open-in-explorer] $Message"
}

function Ensure-Command([string]$CommandName) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "[open-in-explorer][error] Missing command in PATH: $CommandName"
  }
}

function Run-Command([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "[open-in-explorer][error] Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
  }
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
  Log "Node.js: $nodeVersion"

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
    throw "[open-in-explorer][error] dist/index.js not found. Please run build first."
  }

  $resolvedRoots = @()
  foreach ($root in $AllowRoots) {
    if ([string]::IsNullOrWhiteSpace($root)) {
      continue
    }

    $resolvedRoots += $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($root)
  }

  if ($resolvedRoots.Count -eq 0) {
    throw "[open-in-explorer][error] At least one allow root is required."
  }

  Log "Allow roots: $($resolvedRoots -join '; ')"
  Log "Starting MCP server..."

  Run-Command "node" (@("dist/index.js") + $resolvedRoots)
}
finally {
  Wait-ForExit
}
