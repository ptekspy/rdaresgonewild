param(
  [string]$RepoPath = (Get-Location).Path,
  [string]$ZipPath = (Join-Path (Get-Location).Path "paidpolitely-extension-scheduler.zip"),
  [switch]$SkipInstall,
  [switch]$SkipApi
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Resolve-RepoPath([string]$Path) {
  $candidate = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
  if ($candidate -and (Test-Path (Join-Path $candidate.Path "package.json")) -and (Test-Path (Join-Path $candidate.Path "pnpm-workspace.yaml"))) {
    return $candidate.Path
  }

  $nested = Join-Path $Path "rdaresgonewild"
  $nestedCandidate = Resolve-Path -LiteralPath $nested -ErrorAction SilentlyContinue
  if ($nestedCandidate -and (Test-Path (Join-Path $nestedCandidate.Path "package.json")) -and (Test-Path (Join-Path $nestedCandidate.Path "pnpm-workspace.yaml"))) {
    return $nestedCandidate.Path
  }

  throw "Could not find rdaresgonewild repo at '$Path'. Pass -RepoPath C:\path\to\rdaresgonewild."
}

$RepoPath = Resolve-RepoPath $RepoPath
$ZipPath = (Resolve-Path -LiteralPath $ZipPath).Path
$ExtractPath = Join-Path $env:TEMP ("paidpolitely-extension-scheduler-" + [guid]::NewGuid().ToString("N"))

Write-Step "Extracting pack"
New-Item -ItemType Directory -Path $ExtractPath -Force | Out-Null
Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractPath -Force

$PayloadPath = Join-Path $ExtractPath "payload"
if (!(Test-Path $PayloadPath)) {
  throw "Zip did not contain a payload folder."
}

Write-Step "Copying files into $RepoPath"
Copy-Item -Path (Join-Path $PayloadPath "*") -Destination $RepoPath -Recurse -Force

Push-Location $RepoPath
try {
  if (-not $SkipInstall) {
    Write-Step "Installing workspace dependencies"
    corepack enable
    pnpm install
  }

  Write-Step "Generating Prisma client"
  pnpm --filter "@rdgw/database" db:generate

  Write-Step "Building crawler package used by the API"
  pnpm --filter "@rdgw/crawler" build

  Write-Step "Building Chrome extension"
  pnpm --filter "@paidpolitely/reddit-extension" build

  $ExtensionPath = Join-Path $RepoPath "apps\reddit-extension\dist"
  Write-Host "`nChrome extension built at:" -ForegroundColor Green
  Write-Host $ExtensionPath -ForegroundColor Yellow
  Write-Host "Load it in Chrome via chrome://extensions > Developer mode > Load unpacked." -ForegroundColor Green

  if (-not $SkipApi) {
    Write-Step "Starting API on http://localhost:8787"
    $command = "cd /d `"$RepoPath`"; pnpm dev:api"
    Start-Process powershell -WorkingDirectory $RepoPath -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $command)
  }
}
finally {
  Pop-Location
}

Write-Host "`nDone." -ForegroundColor Green
