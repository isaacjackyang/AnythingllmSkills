param(
  [string]$EnvFile = ".env.gateway",
  [switch]$SkipTooling,
  [switch]$PrintEnv,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

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
}

if ($Help) {
  Show-Usage
  exit 0
}

if ($PrintEnv) {
  Get-EnvTemplate | Write-Output
  exit 0
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

Log "Node.js OK: $nodeVersion"
Log "npm OK: $((& npm -v).Trim())"
Log "npx OK"

if (-not (Test-Path "package.json")) {
  Log "package.json not found; initializing npm project..."
  Invoke-CheckedCommand "npm" @("init", "-y")
}

if (-not $SkipTooling) {
  Log "Installing/updating local dev tools: typescript, tsx, @types/node"
  Invoke-CheckedCommand "npm" @("install", "--save-dev", "typescript", "tsx", "@types/node")
  Invoke-CheckedCommand "npx" @("tsc", "--version")
  Invoke-CheckedCommand "npx" @("tsx", "--version")
  Log "TypeScript + tsx ready"
} else {
  Warn "Skipping TypeScript tooling install (-SkipTooling)."
}

if (Test-Path $EnvFile) {
  Warn "$EnvFile already exists; keep existing file."
} else {
  Get-EnvTemplate | Set-Content -Path $EnvFile -Encoding UTF8
  Log "Wrote env template: $EnvFile"
}

Log "Bootstrap completed."
Log "1) Edit env file: $EnvFile"
Log "2) Load env (PowerShell): Get-Content $EnvFile | ForEach-Object { if (`$_ -match '^\s*(?!#)([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable(`$matches[1], `$matches[2], 'Process') } }"
Log "3) Start gateway: npx tsx gateway/server.ts"
