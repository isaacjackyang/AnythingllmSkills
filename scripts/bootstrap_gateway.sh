#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NODE_MAJOR_REQUIRED=20
ENV_FILE=".env.gateway"
SKIP_TOOLING=0
PRINT_ENV_ONLY=0

log() { printf "[bootstrap] %s\n" "$*"; }
warn() { printf "[bootstrap][warn] %s\n" "$*"; }
err() { printf "[bootstrap][error] %s\n" "$*" >&2; }

usage() {
  cat <<USAGE
Usage:
  bash scripts/bootstrap_gateway.sh [options]

Options:
  --env-file <path>     Output env template file path (default: .env.gateway)
  --skip-tooling        Skip npm install of typescript/tsx/@types-node
  --print-env           Print env template and exit
  -h, --help            Show this help
USAGE
}

has_cmd() { command -v "$1" >/dev/null 2>&1; }

run_privileged() {
  if has_cmd sudo; then
    sudo "$@"
  else
    "$@"
  fi
}

gateway_env_template() {
  cat <<ENV
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
ENV
}

write_env_template() {
  if [[ -f "$ENV_FILE" ]]; then
    warn "$ENV_FILE already exists; keep existing file."
    return 0
  fi
  gateway_env_template > "$ENV_FILE"
  log "Wrote env template: $ENV_FILE"
}

install_node_linux() {
  if has_cmd apt-get; then
    log "Detected apt-get. Installing Node.js LTS..."
    run_privileged apt-get update
    run_privileged apt-get install -y nodejs npm
  elif has_cmd dnf; then
    log "Detected dnf. Installing Node.js..."
    run_privileged dnf install -y nodejs npm
  elif has_cmd yum; then
    log "Detected yum. Installing Node.js..."
    run_privileged yum install -y nodejs npm
  elif has_cmd pacman; then
    log "Detected pacman. Installing Node.js..."
    run_privileged pacman -Sy --noconfirm nodejs npm
  elif has_cmd apk; then
    log "Detected apk. Installing Node.js..."
    run_privileged apk add --no-cache nodejs npm
  else
    err "Unsupported Linux package manager. Please install Node.js >= ${NODE_MAJOR_REQUIRED} manually."
    return 1
  fi
}

install_node_macos() {
  if ! has_cmd brew; then
    err "Homebrew not found. Please install Homebrew first, then rerun this script."
    return 1
  fi
  log "Installing Node.js via Homebrew..."
  brew install node
}

install_node_windows() {
  if has_cmd winget; then
    log "Installing Node.js LTS via winget..."
    winget install OpenJS.NodeJS.LTS --silent
  elif has_cmd choco; then
    log "Installing Node.js LTS via choco..."
    choco install nodejs-lts -y
  else
    err "winget/choco not found. Please install Node.js >= ${NODE_MAJOR_REQUIRED} manually."
    return 1
  fi
}

ensure_node() {
  if has_cmd node; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "$major" -lt "$NODE_MAJOR_REQUIRED" ]]; then
      warn "Node.js version is too old: $(node -v). Need >= v${NODE_MAJOR_REQUIRED}."
    else
      log "Node.js OK: $(node -v)"
      return 0
    fi
  else
    warn "Node.js not found."
  fi

  case "$(uname -s)" in
    Linux*) install_node_linux ;;
    Darwin*) install_node_macos ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) install_node_windows ;;
    *) err "Unsupported OS: $(uname -s)"; return 1 ;;
  esac

  if ! has_cmd node; then
    err "Node.js installation did not complete successfully."
    return 1
  fi

  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$major" -lt "$NODE_MAJOR_REQUIRED" ]]; then
    err "Node.js version is still too old: $(node -v)."
    return 1
  fi

  log "Node.js installed: $(node -v)"
}

ensure_npm_npx() {
  if ! has_cmd npm; then
    err "npm not found after Node.js installation."
    return 1
  fi
  log "npm OK: $(npm -v)"

  if ! has_cmd npx; then
    warn "npx not found in PATH. Installing npm package npx..."
    npm install -g npx
  fi

  if ! has_cmd npx; then
    err "npx is still not available."
    return 1
  fi
  log "npx OK"
}

ensure_typescript_tooling() {
  if [[ "$SKIP_TOOLING" -eq 1 ]]; then
    warn "Skipping TypeScript tooling install (--skip-tooling)."
    return 0
  fi

  log "Installing/updating local dev tools: typescript, tsx, @types/node"
  if ! npm install --save-dev typescript tsx @types/node; then
    err "Failed to install TypeScript tooling from npm registry. Check network/proxy/registry policy and rerun."
    return 1
  fi

  npx tsc --version >/dev/null
  npx tsx --version >/dev/null
  log "TypeScript + tsx ready"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-file)
        [[ $# -ge 2 ]] || { err "--env-file requires a value"; exit 1; }
        ENV_FILE="$2"
        shift 2
        ;;
      --skip-tooling)
        SKIP_TOOLING=1
        shift
        ;;
      --print-env)
        PRINT_ENV_ONLY=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done
}

main() {
  parse_args "$@"

  if [[ "$PRINT_ENV_ONLY" -eq 1 ]]; then
    gateway_env_template
    exit 0
  fi

  log "Starting first-run environment check..."
  ensure_node
  ensure_npm_npx

  if [[ ! -f package.json ]]; then
    log "package.json not found; initializing npm project..."
    npm init -y >/dev/null
  fi

  ensure_typescript_tooling
  write_env_template

  log "Bootstrap completed."
  log "1) Edit env file: $ENV_FILE"
  log "2) Load env: set -a; source $ENV_FILE; set +a"
  log "3) Start gateway: npx tsx gateway/server.ts"
}

main "$@"
