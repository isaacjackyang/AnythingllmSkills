param(
  [string]$EnvFile = ".env.gateway",
  [switch]$OpenUi,
  [switch]$NoOpenUi,
  [string]$UiUrl = "http://localhost:8787/approval-ui"
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$ResolvedEnvFile = $EnvFile

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $ResolvedEnvFile = Join-Path $ProjectRoot $EnvFile
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

if ($ShouldOpenUi) {
  Start-Process $UiUrl
  Write-Host "[start_gateway] Opened UI: $UiUrl"
}

Set-Location $ProjectRoot
Write-Host "[start_gateway] Starting gateway with: npx tsx gateway/server.ts"
npx tsx gateway/server.ts
