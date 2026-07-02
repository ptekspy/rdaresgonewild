$edgePaths = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) {
  throw "Could not find Microsoft Edge"
}

Write-Host "Close all Edge windows first if this does not expose your normal logged-in profile."
Write-Host "Starting Edge DevTools on http://127.0.0.1:9222"

& $edge `
  --remote-debugging-port=9222 `
  "https://www.reddit.com/r/daresgonewild/new/"
