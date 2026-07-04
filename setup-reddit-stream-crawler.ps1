param(
  [string]$RepoRoot = (Get-Location).Path,
  [switch]$SkipInstall,
  [switch]$SkipTypeCheck
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$repoRoot = (Resolve-Path $RepoRoot).Path
$packageJson = Join-Path $repoRoot "package.json"
$workspace = Join-Path $repoRoot "pnpm-workspace.yaml"
$sourceRoot = Join-Path $PSScriptRoot "files"

if (!(Test-Path $packageJson) -or !(Test-Path $workspace)) {
  throw "RepoRoot must point at the rdaresgonewild repository root. Could not find package.json and pnpm-workspace.yaml in $repoRoot"
}

if (!(Test-Path $sourceRoot)) {
  throw "Could not find drop-in files folder at $sourceRoot"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $repoRoot ".paidpolitely-crawler-backup\$timestamp"

Write-Step "Copying drop-in files into repo"
Get-ChildItem -Path $sourceRoot -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
  $destination = Join-Path $repoRoot $relative
  $destinationDir = Split-Path $destination -Parent

  if (!(Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  }

  if (Test-Path $destination) {
    $backupDestination = Join-Path $backupRoot $relative
    $backupDir = Split-Path $backupDestination -Parent
    if (!(Test-Path $backupDir)) {
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    Copy-Item -Path $destination -Destination $backupDestination -Force
  }

  Copy-Item -Path $_.FullName -Destination $destination -Force
}

if (!$SkipInstall) {
  Write-Step "Installing workspace dependencies"
  Push-Location $repoRoot
  try {
    pnpm install
    pnpm db:generate
  } finally {
    Pop-Location
  }
}

if (!$SkipTypeCheck) {
  Write-Step "Type-checking API"
  Push-Location $repoRoot
  try {
    pnpm --filter @paidpolitely/api type-check
  } finally {
    Pop-Location
  }
}

Write-Step "Building extension zip"
& (Join-Path $repoRoot "scripts\build-reddit-extension-zip.ps1") -RepoRoot $repoRoot

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Run the API with: pnpm dev:api" -ForegroundColor Green
Write-Host "Load the unpacked extension from: apps/chrome-extension" -ForegroundColor Green
Write-Host "Extension zip created at: dist/chrome-extension/paid-politely-reddit-stream-crawler.zip" -ForegroundColor Green
Write-Host "Backups, if any, are in: $backupRoot" -ForegroundColor DarkGray
