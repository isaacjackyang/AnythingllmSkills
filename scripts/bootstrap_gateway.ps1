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

$nodeVersion = & node -v
$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) {
  Fail "Node.js version is too old: $nodeVersion. Need >= v20."
}

Log "Node.js OK: $nodeVersion"
Log "npm OK: $(& npm -v)"
Log "npx OK"

if (-not (Test-Path "package.json")) {
  Log "package.json not found; initializing npm project..."
  & npm init -y | Out-Null
}

if (-not $SkipTooling) {
  Log "Installing/updating local dev tools: typescript, tsx, @types/node"
  & npm install --save-dev typescript tsx @types/node
  & npx tsc --version | Out-Null
  & npx tsx --version | Out-Null
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
Log "2) Load env (PowerShell): Get-Content $EnvFile | ForEach-Object { if (`$_ -match '^(?!#)([^=]+)=(.*)$') { Set-Item -Path Env:$(`$matches[1]) -Value `$matches[2] } }"
Log "3) Start gateway: npx tsx gateway/server.ts"
