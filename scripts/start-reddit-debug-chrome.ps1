$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  throw "Could not find Google Chrome"
}

Write-Host "Close all Chrome windows first if this does not expose your normal logged-in profile."
Write-Host "Starting Chrome DevTools on http://127.0.0.1:9222"

& $chrome `
  --remote-debugging-port=9222 `
  "https://www.reddit.com/r/daresgonewild/new/"
