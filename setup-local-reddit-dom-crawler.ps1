param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$sourceRoot = $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $repoRoot ".crawler-dropin-backups\$timestamp"

function Copy-WithBackup {
  param(
    [Parameter(Mandatory=$true)][string]$RelativePath
  )

  $src = Join-Path $sourceRoot $RelativePath
  $dst = Join-Path $repoRoot $RelativePath

  if (!(Test-Path $src)) {
    throw "Missing source file: $src"
  }

  if (Test-Path $dst) {
    $backup = Join-Path $backupRoot $RelativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
    Copy-Item -Force $dst $backup
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item -Force $src $dst
}

$paths = @(
  "apps/chrome-extension/manifest.json",
  "apps/chrome-extension/background.js",
  "apps/chrome-extension/popup.html",
  "apps/chrome-extension/popup.css",
  "apps/chrome-extension/popup.js",
  "packages/reddit-local-db-writer/package.json",
  "packages/reddit-local-db-writer/tsconfig.json",
  "packages/reddit-local-db-writer/src/server.ts",
  "scripts/build-reddit-extension-zip.ps1"
)

foreach ($path in $paths) {
  Copy-WithBackup $path
}

# Patch root package.json scripts.
$packagePath = Join-Path $repoRoot "package.json"
if (!(Test-Path $packagePath)) {
  throw "Run this from the rdaresgonewild repo root. package.json was not found."
}

$pkg = Get-Content $packagePath -Raw | ConvertFrom-Json
if (-not $pkg.scripts) {
  $pkg | Add-Member -MemberType NoteProperty -Name scripts -Value ([pscustomobject]@{})
}

$pkg.scripts | Add-Member -Force -MemberType NoteProperty -Name "crawler:local-db" -Value "pnpm --filter @rdgw/reddit-local-db-writer dev"
$pkg.scripts | Add-Member -Force -MemberType NoteProperty -Name "crawler:extension:zip" -Value "powershell -ExecutionPolicy Bypass -File .\scripts\build-reddit-extension-zip.ps1"

$pkg | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 $packagePath

if (-not $SkipInstall) {
  pnpm install
}

pnpm db:generate
powershell -ExecutionPolicy Bypass -File .\scripts\build-reddit-extension-zip.ps1

Write-Host ""
Write-Host "Local Reddit DOM crawler installed."
Write-Host "Run the local DB writer with:"
Write-Host "  pnpm crawler:local-db"
Write-Host ""
Write-Host "Then load apps/chrome-extension via chrome://extensions."
Write-Host "Backups, if any, were saved to: $backupRoot"
