$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $root '.runtime-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'startup.log'

function Write-StartupLog([string]$message) {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $message"
}

function Test-LocalPort([int]$port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $port)
    return $task.Wait(1000) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-LocalPort([int]$port, [int]$seconds, [string]$serviceName) {
  for ($attempt = 0; $attempt -lt $seconds; $attempt++) {
    if (Test-LocalPort $port) { return $true }
    Start-Sleep -Seconds 1
  }
  Write-StartupLog "$serviceName did not become available on port $port within $seconds seconds."
  return $false
}

function Start-NodeService([string]$arguments, [string]$stdoutName, [string]$stderrName) {
  Start-Process -FilePath 'node.exe' -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory $stdoutName) `
    -RedirectStandardError (Join-Path $logDirectory $stderrName) | Out-Null
}

try {
  Write-StartupLog 'Starting INKORA local services.'

  $dockerDesktop = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    if (Test-Path $dockerDesktop) {
      Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null
      Write-StartupLog 'Started Docker Desktop.'
    } else {
      throw 'Docker Desktop was not found.'
    }
  }

  $dockerReady = $false
  for ($attempt = 0; $attempt -lt 180; $attempt++) {
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $dockerReady) { throw 'Docker Engine did not become ready within six minutes.' }

  & docker compose --env-file (Join-Path $root 'n8n\.env') -f (Join-Path $root 'n8n\docker-compose.yml') up -d *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the n8n Compose service.' }
  Write-StartupLog 'Ensured n8n is running from its persistent Docker volume.'

  if (-not (Wait-LocalPort 8642 90 'Hermes API')) {
    $hermes = Get-Command 'hermes.exe' -ErrorAction SilentlyContinue
    if ($hermes) {
      Start-Process -FilePath $hermes.Source -ArgumentList 'gateway run --quiet' -WorkingDirectory $root -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'hermes-startup.log') `
        -RedirectStandardError (Join-Path $logDirectory 'hermes-stderr.log') | Out-Null
    }
    if (-not (Wait-LocalPort 8642 90 'Hermes API')) { throw 'Hermes API server is not available.' }
  }
  Write-StartupLog 'Hermes API is available.'

  if (-not (Test-LocalPort 3000)) {
    Start-NodeService '--use-system-ca --experimental-strip-types --env-file=.env apps/api/src/server.ts' 'api-startup.log' 'api-stderr.log'
    if (-not (Wait-LocalPort 3000 60 'INKORA API')) { throw 'INKORA API did not start.' }
  }
  Write-StartupLog 'INKORA API is available.'

  if (-not (Test-LocalPort 3099)) {
    Start-NodeService '--experimental-strip-types apps/api/src/tunnel-proxy.ts' 'tunnel-proxy.log' 'tunnel-proxy-stderr.log'
    if (-not (Wait-LocalPort 3099 30 'Integration tunnel proxy')) { throw 'Integration tunnel proxy did not start.' }
  }
  Write-StartupLog 'Integration tunnel proxy is available.'

  $tunnelName = 'printshop-ai-temporary-tunnel'
  $inspect = & docker inspect $tunnelName 2>$null
  if ($LASTEXITCODE -eq 0) {
    $container = $inspect | ConvertFrom-Json | Select-Object -First 1
    if ($container.State.Status -ne 'running') {
      & docker start $tunnelName *> $null
      if ($LASTEXITCODE -ne 0) { throw 'Could not restart the Cloudflare Quick Tunnel container.' }
    }
  } else {
    & docker run --detach --name $tunnelName --restart unless-stopped cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:3099 *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Cloudflare Quick Tunnel container.' }
  }

  $publicTunnelUrl = $null
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $cloudflaredLogs = & docker logs $tunnelName 2>&1 | Out-String
    $urlMatches = [regex]::Matches($cloudflaredLogs, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    if ($urlMatches.Count -gt 0) { $publicTunnelUrl = $urlMatches[$urlMatches.Count - 1].Value.TrimEnd('/'); break }
    Start-Sleep -Seconds 2
  }
  if (-not $publicTunnelUrl) { throw 'Cloudflare Quick Tunnel did not publish a URL.' }

  $tunnelStatePath = Join-Path $logDirectory 'cloudflare-tunnel-url.txt'
  $previousTunnelUrl = if (Test-Path $tunnelStatePath) { (Get-Content $tunnelStatePath -Raw).Trim() } else { '' }
  if ($publicTunnelUrl -ne $previousTunnelUrl) {
    Push-Location $root
    try {
      $null = "$publicTunnelUrl/hermes" | & npx wrangler secret put HERMES_BASE_URL --config wrangler.worker.toml 2>&1
      if ($LASTEXITCODE -ne 0) { throw 'Could not update the Cloudflare Hermes URL secret.' }
      $null = "$publicTunnelUrl/n8n" | & npx wrangler secret put N8N_WEBHOOK_BASE_URL --config wrangler.worker.toml 2>&1
      if ($LASTEXITCODE -ne 0) { throw 'Could not update the Cloudflare n8n URL secret.' }
    } finally {
      Pop-Location
    }
    Set-Content -LiteralPath $tunnelStatePath -Value $publicTunnelUrl -NoNewline
    Write-StartupLog 'Updated Cloudflare Worker integration URLs for the current Quick Tunnel.'
  } else {
    Write-StartupLog 'Cloudflare integration URLs already match the current Quick Tunnel.'
  }

  try {
    $ready = Invoke-WebRequest 'http://127.0.0.1:3000/ready' -SkipHttpErrorCheck -TimeoutSec 8
    Write-StartupLog "Local API readiness status: $($ready.StatusCode)."
  } catch {
    Write-StartupLog 'Local API readiness request failed.'
  }
  Write-StartupLog 'INKORA startup sequence completed.'
} catch {
  Write-StartupLog "Startup failed: $($_.Exception.Message)"
  exit 1
}
