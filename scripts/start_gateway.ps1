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
