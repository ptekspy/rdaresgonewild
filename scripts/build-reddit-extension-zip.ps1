$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$extensionDir = Join-Path $repoRoot "apps\chrome-extension"
$distDir = Join-Path $repoRoot "dist"
$zipPath = Join-Path $distDir "paid-politely-reddit-dom-crawler-extension.zip"

if (!(Test-Path $extensionDir)) {
  throw "Extension directory not found: $extensionDir"
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

$required = @("manifest.json", "background.js", "popup.html", "popup.css", "popup.js")
foreach ($file in $required) {
  $path = Join-Path $extensionDir $file
  if (!(Test-Path $path)) {
    throw "Missing extension file: $path"
  }
}

Compress-Archive -Path (Join-Path $extensionDir "*") -DestinationPath $zipPath -Force

Write-Host "Built extension zip:"
Write-Host "  $zipPath"
