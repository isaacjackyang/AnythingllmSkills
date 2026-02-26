param(
  [string]$EnvFile = ".env.gateway",
  [string]$StartScript = "scripts/start_gateway.ps1",
  [switch]$SkipTooling,
  [switch]$NoStart,
  [switch]$NoHealthCheck,
  [switch]$ForceBootstrap,
  [int]$HealthTimeoutSec = 25
)

$ErrorActionPreference = "Stop"

function Info([string]$Message) {
  Write-Host "[check-fix] $Message"
}

function Warn([string]$Message) {
  Write-Warning "[check-fix] $Message"
}

function Fail([string]$Message) {
  throw "[check-fix][error] $Message"
}

function Resolve-ProjectRoot {
  if ($PSScriptRoot) {
    return $PSScriptRoot
  }

  if ($MyInvocation.MyCommand.Path) {
    return Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  return (Get-Location).Path
}

function Ensure-Command([string]$Name, [switch]$Optional) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    if ($Optional) {
      Warn "$Name not found"
      return $false
    }
    Fail "$Name not found in PATH"
  }

  Info "$Name detected"
  return $true
}

function Get-EnvMap([string]$Path) {
  $map = @{}

  if (-not (Test-Path $Path)) {
    return $map
  }

  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*(?!#)([^=]+)=(.*)$') {
      $key = $matches[1].Trim()
      $value = $matches[2]
      $map[$key] = $value
    }
  }

  return $map
}

function Ensure-BootstrapArtifacts([string]$ProjectRoot, [string]$EnvPath, [string]$StartPath, [switch]$SkipTooling, [switch]$ForceBootstrap) {
  $bootstrap = Join-Path $ProjectRoot "scripts/bootstrap_gateway.ps1"
  if (-not (Test-Path $bootstrap)) {
    Fail "bootstrap script not found: $bootstrap"
  }

  $needsBootstrap = $ForceBootstrap -or -not (Test-Path $EnvPath) -or -not (Test-Path $StartPath)
  if (-not $needsBootstrap) {
    Info "Bootstrap artifacts already exist (.env/start script)."
    return
  }

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $bootstrap,
    "-EnvFile", $EnvPath,
    "-StartScriptFile", $StartPath
  )

  if ($SkipTooling) {
    $args += "-SkipTooling"
  }

  Info "Running bootstrap to create/fix missing artifacts..."
  & powershell @args
  if ($LASTEXITCODE -ne 0) {
    Fail "bootstrap failed with exit code $LASTEXITCODE"
  }

  if (-not (Test-Path $EnvPath)) {
    Fail "env file still missing after bootstrap: $EnvPath"
  }

  if (-not (Test-Path $StartPath)) {
    Fail "start script still missing after bootstrap: $StartPath"
  }

  Info "Bootstrap artifacts are ready."
}

function Ensure-TsxRunnable([string]$ProjectRoot) {
  Push-Location $ProjectRoot
  try {
    Info "Checking tsx availability..."
    & npx --yes tsx --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Warn "npx tsx check failed (exit $LASTEXITCODE)"
      Warn "Common causes: npm registry policy/proxy blocks (HTTP 403), offline network, missing package installation rights."
      return $false
    }

    Info "tsx is runnable"
    return $true
  }
  finally {
    Pop-Location
  }
}

function Start-GatewayProcess([string]$ProjectRoot) {
  Push-Location $ProjectRoot
  try {
    Info "Starting gateway in background: npx tsx gateway/server.ts"
    $proc = Start-Process -FilePath "npx" -ArgumentList @("tsx", "gateway/server.ts") -PassThru
    Start-Sleep -Seconds 2

    if ($proc.HasExited) {
      Warn "Gateway process exited immediately (exit=$($proc.ExitCode))."
      Warn "Try foreground run for logs: npx tsx gateway/server.ts"
      return $null
    }

    Info "Gateway started. PID=$($proc.Id)"
    return $proc
  }
  finally {
    Pop-Location
  }
}

function Wait-Health([int]$TimeoutSec) {
  $uri = "http://localhost:8787/healthz"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)

  do {
    try {
      $resp = Invoke-RestMethod -Uri $uri -Method GET -TimeoutSec 3
      if ($resp -and $resp.ok -eq $true) {
        Info "healthz ok=true"
        return $true
      }

      if ($resp) {
        Warn "healthz responded but not ok: $($resp | ConvertTo-Json -Compress)"
      }
    }
    catch {
      Start-Sleep -Milliseconds 700
    }
  } while ((Get-Date) -lt $deadline)

  Warn "healthz check timeout after ${TimeoutSec}s"
  return $false
}

$root = Resolve-ProjectRoot
$envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $root $EnvFile }
$startPath = if ([System.IO.Path]::IsPathRooted($StartScript)) { $StartScript } else { Join-Path $root $StartScript }

Info "Project root: $root"

Ensure-Command "node" | Out-Null
Ensure-Command "npm" | Out-Null
Ensure-Command "npx" | Out-Null
Ensure-Command "powershell" -Optional | Out-Null

Ensure-BootstrapArtifacts -ProjectRoot $root -EnvPath $envPath -StartPath $startPath -SkipTooling:$SkipTooling -ForceBootstrap:$ForceBootstrap

$envMap = Get-EnvMap $envPath
if (-not $envMap.ContainsKey("ANYTHINGLLM_API_KEY") -or [string]::IsNullOrWhiteSpace($envMap["ANYTHINGLLM_API_KEY"])) {
  Warn "ANYTHINGLLM_API_KEY is empty in $envPath"
  Warn "Gateway can start, but brain calls will fail until key is set."
} else {
  Info "ANYTHINGLLM_API_KEY appears configured"
}

if ($envMap.ContainsKey("ANYTHINGLLM_BASE_URL") -and -not [string]::IsNullOrWhiteSpace($envMap["ANYTHINGLLM_BASE_URL"])) {
  Info "ANYTHINGLLM_BASE_URL=$($envMap["ANYTHINGLLM_BASE_URL"])"
} else {
  Warn "ANYTHINGLLM_BASE_URL missing; default in code is http://localhost:3001"
}

$tsxReady = Ensure-TsxRunnable -ProjectRoot $root
if (-not $tsxReady) {
  Warn "Skip auto-start because tsx is not runnable."
  Info "Suggested next checks:"
  Info "  1) npm config get registry"
  Info "  2) verify proxy / whitelist registry.npmjs.org"
  Info "  3) if policy blocks npx, preinstall tsx in approved mirror"
  exit 2
}

if ($NoStart) {
  Info "NoStart enabled. Validation complete."
  exit 0
}

$proc = Start-GatewayProcess -ProjectRoot $root
if (-not $proc) {
  exit 3
}

if ($NoHealthCheck) {
  Info "NoHealthCheck enabled. Gateway process left running (PID=$($proc.Id))."
  exit 0
}

$healthOk = Wait-Health -TimeoutSec $HealthTimeoutSec
if ($healthOk) {
  Info "Gateway check/fix completed successfully."
  Info "You can now test web channel: POST http://localhost:8787/api/agent/command"
  exit 0
}

Warn "Health check failed; stopping background gateway process PID=$($proc.Id)"
try {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
} catch {
  Warn "Unable to stop process PID=$($proc.Id)"
}
exit 4
