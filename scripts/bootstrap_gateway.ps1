param(
  [string]$EnvFile = ".env.gateway",
  [string]$StartScriptFile = "scripts/start_gateway.ps1",
  [switch]$SkipTooling,
  [switch]$PrintEnv,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$CheckSummary = [System.Collections.Generic.List[string]]::new()
$InstallSummary = [System.Collections.Generic.List[string]]::new()

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$ResolvedEnvFile = $EnvFile
$ResolvedStartScriptFile = $StartScriptFile

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $ResolvedEnvFile = Join-Path $ProjectRoot $EnvFile
}

if (-not [System.IO.Path]::IsPathRooted($StartScriptFile)) {
  $ResolvedStartScriptFile = Join-Path $ProjectRoot $StartScriptFile
}

function Add-CheckSummary([string]$Message) {
  $CheckSummary.Add($Message) | Out-Null
}

function Add-InstallSummary([string]$Message) {
  $InstallSummary.Add($Message) | Out-Null
}

function Log([string]$Message) {
  Write-Host "[bootstrap] $Message"
}

function Invoke-CheckedCommand([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "Command failed (exit $LASTEXITCODE): $Command $($Arguments -join ' ')"
  }
}

function Warn([string]$Message) {
  Write-Warning "[bootstrap] $Message"
}

function Fail([string]$Message) {
  throw "[bootstrap][error] $Message"
}

function Show-Usage {
@"
Usage:
  .\scripts\bootstrap_gateway.ps1 [options]

Options:
  -EnvFile <path>   Output env template file path (default: .env.gateway)
  -StartScriptFile  Output start script path (default: scripts/start_gateway.ps1)
  -SkipTooling      Skip npm install of typescript/tsx/@types-node
  -PrintEnv         Print env template and exit
  -Help             Show this help
"@ | Write-Host
}

function Get-EnvTemplate {
@"
# Gateway basic
PORT=8787
DEFAULT_WORKSPACE=maiecho-prod
DEFAULT_AGENT=ops-agent
HEARTBEAT_INTERVAL_MS=10000
SOUL_ROLE=gateway

# AnythingLLM (required for brain calls)
ANYTHINGLLM_BASE_URL=http://localhost:3001
ANYTHINGLLM_API_KEY=

# Optional channels
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

# Optional task runner tuning
TASK_RUNNER_INTERVAL_MS=2000
TASK_WORKER_ID=
"@
}

function Ensure-Command([string]$CommandName) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    Fail "$CommandName not found in PATH. Please install it first."
  }

  Add-CheckSummary "Found required command: $CommandName"
}

function Show-FinalSummary {
  Write-Host ""
  Write-Host "========== Bootstrap Summary =========="

  if ($CheckSummary.Count -gt 0) {
    Write-Host "Checks completed:"
    foreach ($entry in $CheckSummary) {
      Write-Host "  - $entry"
    }
  } else {
    Write-Host "Checks completed: (none)"
  }

  if ($InstallSummary.Count -gt 0) {
    Write-Host "Actions/installs performed:"
    foreach ($entry in $InstallSummary) {
      Write-Host "  - $entry"
    }
  } else {
    Write-Host "Actions/installs performed: none"
  }

  Write-Host "======================================="
}

function Wait-ForExit {
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
  Set-Location $ProjectRoot

  if ($Help) {
    Show-Usage
    return
  }

  if ($PrintEnv) {
    Get-EnvTemplate | Write-Output
    return
  }

  Log "Starting first-run environment check..."

  Ensure-Command "node"
  Ensure-Command "npm"
  Ensure-Command "npx"

  $nodeVersion = (& node -v).Trim()
  $nodeMajorRaw = (& node -p "process.versions.node.split('.')[0]").Trim()
  $nodeMajor = 0
  if (-not [int]::TryParse($nodeMajorRaw, [ref]$nodeMajor)) {
    Fail "Unable to parse Node.js major version from: $nodeVersion"
  }
  if ($nodeMajor -lt 20) {
    Fail "Node.js version is too old: $nodeVersion. Need >= v20."
  }
  Add-CheckSummary "Node.js version check passed: $nodeVersion"

  $npmVersion = (& npm -v).Trim()
  Add-CheckSummary "npm version check passed: $npmVersion"

  Log "Node.js OK: $nodeVersion"
  Log "npm OK: $npmVersion"
  Log "npx OK"

  if (-not (Test-Path "package.json")) {
    Log "package.json not found; initializing npm project..."
    Invoke-CheckedCommand "npm" @("init", "-y")
    Add-InstallSummary "Initialized npm project (npm init -y)"
  } else {
    Add-CheckSummary "package.json already exists"
  }

  if (-not $SkipTooling) {
    Log "Installing/updating local dev tools: typescript, tsx, @types/node"
    Invoke-CheckedCommand "npm" @("install", "--save-dev", "typescript", "tsx", "@types/node")
    Invoke-CheckedCommand "npx" @("tsc", "--version")
    Invoke-CheckedCommand "npx" @("tsx", "--version")
    Add-InstallSummary "Installed/updated dev tools: typescript, tsx, @types/node"
    Log "TypeScript + tsx ready"
  } else {
    Warn "Skipping TypeScript tooling install (-SkipTooling)."
    Add-CheckSummary "Skipped tooling installation by request (-SkipTooling)"
  }

  if (Test-Path $ResolvedEnvFile) {
    Warn "$ResolvedEnvFile already exists; keep existing file."
    Add-CheckSummary "Env file already exists: $ResolvedEnvFile"
  } else {
    Get-EnvTemplate | Set-Content -Path $ResolvedEnvFile -Encoding UTF8
    Add-InstallSummary "Created env template file: $ResolvedEnvFile"
    Log "Wrote env template: $ResolvedEnvFile"
  }

  if (Test-Path $ResolvedStartScriptFile) {
    Warn "$ResolvedStartScriptFile already exists; keep existing file."
    Add-CheckSummary "Start script already exists: $ResolvedStartScriptFile"
  } else {
    $startScriptDirectory = Split-Path -Parent $ResolvedStartScriptFile
    if (-not [string]::IsNullOrWhiteSpace($startScriptDirectory) -and -not (Test-Path $startScriptDirectory)) {
      New-Item -Path $startScriptDirectory -ItemType Directory -Force | Out-Null
      Add-InstallSummary "Created start script directory: $startScriptDirectory"
    }

    @'
param(
  [string]$EnvFile = ".env.gateway",
  [switch]$OpenUi,
  [switch]$NoOpenUi,
  [string]$UiUrl = "http://localhost:8787/approval-ui",
  [string]$UiFileRelativePath = "gateway/web/approval_ui/index.html",
  [int]$UiWaitTimeoutSec = 20
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$ResolvedEnvFile = $EnvFile

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $ResolvedEnvFile = Join-Path $ProjectRoot $EnvFile
}

function Wait-Health([int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try {
      $resp = Invoke-RestMethod -Uri "http://localhost:8787/healthz" -Method GET -TimeoutSec 3
      if ($resp -and $resp.ok -eq $true) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Open-ApprovalUi([string]$PrimaryUrl, [string]$FallbackFilePath) {
  try {
    Start-Process $PrimaryUrl | Out-Null
    Write-Host "[start_gateway] Opened UI URL: $PrimaryUrl"
    return
  } catch {
    Write-Warning "[start_gateway] Failed to open UI URL ($PrimaryUrl): $($_.Exception.Message)"
  }

  if (Test-Path $FallbackFilePath) {
    try {
      Start-Process $FallbackFilePath | Out-Null
      Write-Host "[start_gateway] Opened local UI file: $FallbackFilePath"
      return
    } catch {
      Write-Warning "[start_gateway] Failed to open local UI file ($FallbackFilePath): $($_.Exception.Message)"
    }
  } else {
    Write-Warning "[start_gateway] Local UI file not found: $FallbackFilePath"
  }

  Write-Warning "[start_gateway] Could not open Approval UI automatically."
}

if (Test-Path $ResolvedEnvFile) {
  Get-Content $ResolvedEnvFile | ForEach-Object {
    if ($_ -match '^\s*(?!#)([^=]+)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
  }
  Write-Host "[start_gateway] Loaded env: $ResolvedEnvFile"
} else {
  Write-Warning "[start_gateway] Env file not found: $ResolvedEnvFile (continuing with current process env)"
}

$ShouldOpenUi = $OpenUi -or (-not $NoOpenUi)
$UiFilePath = Join-Path $ProjectRoot $UiFileRelativePath

Set-Location $ProjectRoot
Write-Host "[start_gateway] Starting gateway with: npx tsx gateway/server.ts"
$gatewayProcess = Start-Process -FilePath "npx" -ArgumentList @("tsx", "gateway/server.ts") -PassThru

Start-Sleep -Seconds 1
if ($gatewayProcess.HasExited) {
  throw "[start_gateway][error] Gateway process exited immediately (exit=$($gatewayProcess.ExitCode))."
}

$healthOk = Wait-Health -TimeoutSec $UiWaitTimeoutSec
if ($healthOk) {
  Write-Host "[start_gateway] Gateway health check passed."
} else {
  Write-Warning "[start_gateway] Health check did not become ready within ${UiWaitTimeoutSec}s"
}

if ($ShouldOpenUi) {
  Open-ApprovalUi -PrimaryUrl $UiUrl -FallbackFilePath $UiFilePath
}

Wait-Process -Id $gatewayProcess.Id
exit $gatewayProcess.ExitCode
'@ | Set-Content -Path $ResolvedStartScriptFile -Encoding UTF8

    Add-InstallSummary "Created start script: $ResolvedStartScriptFile"
    Log "Wrote start script: $ResolvedStartScriptFile"
  }

  Log "Bootstrap completed."
  Log "1) Edit env file: $ResolvedEnvFile"
  Log "2) Load env (PowerShell): Get-Content '$ResolvedEnvFile' | ForEach-Object { if (`$_ -match '^\s*(?!#)([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable(`$matches[1], `$matches[2], 'Process') } }"
  Log "3) Start gateway (auto open UI): .\$($StartScriptFile -replace '/', '\\')"
  Log "4) Start gateway without opening UI: .\$($StartScriptFile -replace '/', '\\') -NoOpenUi"
  Log "5) Start gateway + open UI explicitly: .\$($StartScriptFile -replace '/', '\\') -OpenUi"
}
finally {
  Show-FinalSummary
  Wait-ForExit
}
