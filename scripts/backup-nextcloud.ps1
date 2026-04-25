param(
  [string]$BackupRoot = ".\backups\nextcloud",
  [string]$ComposeEnv = ".env.nextcloud.example"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backupPath = Join-Path (Resolve-Path $repoRoot) $BackupRoot
$target = Join-Path $backupPath $timestamp

New-Item -ItemType Directory -Force $target | Out-Null

function Save-DockerVolume {
  param(
    [string]$Volume,
    [string]$FileName
  )

  $targetResolved = Resolve-Path $target
  docker run --rm `
    -v "${Volume}:/source:ro" `
    -v "${targetResolved}:/backup" `
    alpine:3.20 `
    sh -c "cd /source && tar czf /backup/${FileName} ."
}

Write-Host "[backup] Ziel: $target"
Write-Host "[backup] Dump Nextcloud PostgreSQL..."
docker exec flathackwiki-nextcloud-db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' |
  Set-Content -Encoding UTF8 (Join-Path $target "nextcloud-db.sql")

Write-Host "[backup] Sichere Nextcloud Volumes..."
Save-DockerVolume -Volume "openclaw-wiki_nextcloud_data" -FileName "nextcloud-data.tar.gz"
Save-DockerVolume -Volume "openclaw-wiki_nextcloud_config" -FileName "nextcloud-config.tar.gz"
Save-DockerVolume -Volume "openclaw-wiki_nextcloud_apps" -FileName "nextcloud-apps.tar.gz"

Write-Host "[backup] Kopiere Compose/Env Vorlagen..."
Copy-Item (Join-Path $repoRoot "docker-compose.nextcloud.yml") (Join-Path $target "docker-compose.nextcloud.yml")
Copy-Item (Join-Path $repoRoot $ComposeEnv) (Join-Path $target (Split-Path -Leaf $ComposeEnv))

Write-Host "[backup] Fertig: $target"
