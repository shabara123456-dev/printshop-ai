param(
  [string]$Container = "n8n-n8n-1"
)

$ErrorActionPreference = "Stop"

function Invoke-Docker {
  param([Parameter(Mandatory = $true)][string[]]$DockerArgs)

  $commandOutput = & docker @DockerArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    $outputText = ($commandOutput | Out-String)
    if (($DockerArgs -contains "export:credentials") -and $outputText -match "No credentials found with specified filters") {
      Write-Output "n8n has no saved credentials; recording an empty credential backup."
      return
    }
    throw "Docker command failed with exit code $LASTEXITCODE. Check that Docker Desktop and the n8n container are running."
  }
}

$versionOutput = & docker exec $Container n8n --version
if ($LASTEXITCODE -ne 0) {
  throw "Could not read the n8n version from container '$Container'. Start Docker Desktop and n8n, then retry."
}
$n8nVersion = ($versionOutput | Out-String).Trim()

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$containerBackup = "/tmp/inkora-n8n-backup-$timestamp"
$backupRoot = Join-Path $PSScriptRoot "backups"
$destination = Join-Path $backupRoot $timestamp

New-Item -ItemType Directory -Path $destination -Force | Out-Null
Invoke-Docker -DockerArgs @("exec", $Container, "mkdir", "-p", "$containerBackup/workflows", "$containerBackup/credentials")

try {
  Invoke-Docker -DockerArgs @("exec", $Container, "n8n", "export:workflow", "--backup", "--output=$containerBackup/workflows")
  Invoke-Docker -DockerArgs @("exec", $Container, "n8n", "export:credentials", "--backup", "--output=$containerBackup/credentials")
  Invoke-Docker -DockerArgs @("cp", "${Container}:$containerBackup/.", $destination)

  $workflowCount = @(Get-ChildItem -LiteralPath (Join-Path $destination "workflows") -File -Filter "*.json").Count
  $credentialCount = @(Get-ChildItem -LiteralPath (Join-Path $destination "credentials") -File -Filter "*.json").Count
  if ($workflowCount -eq 0) {
    throw "The workflow backup contains no JSON files. Backup retained at '$destination' for inspection."
  }

  @(
    "INKORA n8n backup"
    "Created: $(Get-Date -Format o)"
    "n8n version: $n8nVersion"
    "Workflow files: $workflowCount"
    "Encrypted credential files: $credentialCount"
    ""
    "Credential exports were made without --decrypted. Restore them only into an n8n instance configured with the same N8N_ENCRYPTION_KEY."
    "This directory is gitignored. Keep it private and copy it to a protected backup location before migrating or replacing the n8n instance."
  ) | Set-Content -LiteralPath (Join-Path $destination "BACKUP-INFO.txt") -Encoding UTF8

  Write-Output "n8n $n8nVersion backup created at: $destination"
  Write-Output "Workflow files: $workflowCount; encrypted credential files: $credentialCount"
}
finally {
  & docker exec $Container rm -rf $containerBackup 2>$null
}
