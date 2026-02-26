param(
  [string[]]$AllowRoots = @("C:\agent_sandbox"),
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$HealthCheck,
  [int]$HealthCheckTimeoutSeconds = 8,
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

function Invoke-HealthCheck([string[]]$Roots, [int]$TimeoutSeconds) {
  if ($TimeoutSeconds -lt 3) {
    throw "[open-in-explorer][error] HealthCheckTimeoutSeconds must be >= 3."
  }

  $stdoutLog = [System.IO.Path]::GetTempFileName()
  $stderrLog = [System.IO.Path]::GetTempFileName()

  try {
    $process = Start-Process -FilePath "node" -ArgumentList (@("dist/index.js") + $Roots) -PassThru -NoNewWindow -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

    Start-Sleep -Seconds 3

    if ($process.HasExited) {
      $stderr = ""
      if (Test-Path $stderrLog) {
        $stderr = (Get-Content -Raw -Path $stderrLog).Trim()
      }

      if ([string]::IsNullOrWhiteSpace($stderr)) {
        throw "[open-in-explorer][error] Health check failed: process exited early with code $($process.ExitCode)."
      }

      throw "[open-in-explorer][error] Health check failed: process exited early with code $($process.ExitCode). stderr: $stderr"
    }

    Start-Sleep -Seconds ($TimeoutSeconds - 3)

    if ($process.HasExited) {
      throw "[open-in-explorer][error] Health check failed: process exited before timeout with code $($process.ExitCode)."
    }

    Log "Health check passed. Process stayed alive for $TimeoutSeconds seconds."
  }
  finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
      Wait-Process -Id $process.Id
    }

    if (Test-Path $stdoutLog) {
      Remove-Item -Path $stdoutLog -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $stderrLog) {
      Remove-Item -Path $stderrLog -Force -ErrorAction SilentlyContinue
    }
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
  if ($HealthCheck) {
    Log "Running MCP server health check..."
    Invoke-HealthCheck -Roots $resolvedRoots -TimeoutSeconds $HealthCheckTimeoutSeconds
  } else {
    Log "Starting MCP server..."
    Run-Command "node" (@("dist/index.js") + $resolvedRoots)
  }
}
finally {
  Wait-ForExit
}
