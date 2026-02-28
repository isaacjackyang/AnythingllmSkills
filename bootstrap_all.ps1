param(
  [ValidateSet("all", "gateway", "open-in-explorer")]
  [string]$Target = "all",
  [switch]$SkipGatewayTooling,
  [switch]$SkipGatewayLanceDb,
  [switch]$SkipExplorerInstall,
  [switch]$SkipExplorerBuild,
  [switch]$BuildExplorerExe,
  [switch]$RunHealthChecks,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Log([string]$Message) {
  Write-Host "[bootstrap-all] $Message"
}

function Run-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "[bootstrap-all][error] Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
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

function Invoke-GatewayBootstrap {
  $scriptPath = Join-Path $ScriptRoot "scripts/bootstrap_gateway.ps1"
  if (-not (Test-Path $scriptPath)) {
    throw "[bootstrap-all][error] Missing script: $scriptPath"
  }

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $scriptPath
  )

  if ($SkipGatewayTooling) {
    $args += "-SkipTooling"
  }

  if ($SkipGatewayLanceDb) {
    $args += "-SkipLanceDb"
  }

  Log "Bootstrapping gateway..."
  Run-Checked "powershell" $args

  if ($RunHealthChecks) {
    $checkScript = Join-Path $ScriptRoot "check_and_fix_gateway.ps1"
    if (-not (Test-Path $checkScript)) {
      throw "[bootstrap-all][error] Missing script: $checkScript"
    }

    $checkArgs = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $checkScript,
      "-NoStart"
    )

    if ($SkipGatewayTooling) {
      $checkArgs += "-SkipTooling"
    }

    Log "Running gateway health pre-check (-NoStart)..."
    Run-Checked "powershell" $checkArgs
  }
}

function Invoke-OpenExplorerBootstrap {
  $scriptPath = Join-Path $ScriptRoot "mcp-open-in-explorer/bootstrap_open_in_explorer.ps1"
  if (-not (Test-Path $scriptPath)) {
    throw "[bootstrap-all][error] Missing script: $scriptPath"
  }

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $scriptPath,
    "-NoPause"
  )

  if ($SkipExplorerInstall) {
    $args += "-SkipInstall"
  }

  if ($SkipExplorerBuild) {
    $args += "-SkipBuild"
  }

  if ($BuildExplorerExe) {
    $args += "-BuildExe"
  }

  if ($RunHealthChecks) {
    $args += "-RunStartHealthCheck"
  }

  Log "Bootstrapping mcp-open-in-explorer..."
  Run-Checked "powershell" $args
}

try {
  switch ($Target) {
    "gateway" {
      Invoke-GatewayBootstrap
    }
    "open-in-explorer" {
      Invoke-OpenExplorerBootstrap
    }
    default {
      Invoke-GatewayBootstrap
      Invoke-OpenExplorerBootstrap
    }
  }

  Log "Done."
  Log "Recommended next step (gateway): .\\scripts\\start_gateway.ps1"
  Log "Recommended next step (mcp-open-in-explorer): .\\mcp-open-in-explorer\\start_open_in_explorer.ps1"
}
finally {
  Wait-ForExit
}
