# VEO3 Launcher — du phong neu launch.cmd loi
param(
    [Parameter(Mandatory = $true)]
    [string]$ProtocolUrl
)

$profileId = 'default'
$openUrl = 'https://gemini.google.com/app'
$raw = [string]$ProtocolUrl

if ($raw -match '(?:\?|&)profileId=([^&]+)') {
    $profileId = [System.Uri]::UnescapeDataString($matches[1].Trim())
}
if ($raw -match '(?:\?|&)targetUrl=([^&]+)') {
    $openUrl = [System.Uri]::UnescapeDataString($matches[1].Trim())
} elseif ($raw -match '(?:\?|&)appUrl=([^&]+)') {
    $openUrl = [System.Uri]::UnescapeDataString($matches[1].Trim())
}

if (-not $profileId) { $profileId = 'default' }
$profileId = $profileId -replace '[<>:"/\\|?*]', '-'
if (-not $openUrl) { $openUrl = 'https://gemini.google.com/app' }

$userDataDir = Join-Path 'C:\VEO3PRO\ChromeProfiles' $profileId
if (-not (Test-Path -LiteralPath $userDataDir)) {
    New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
}

$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$($env:ProgramFiles(x86))\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromeExe = ($chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
if (-not $chromeExe) { $chromeExe = 'chrome' }

Start-Process -FilePath $chromeExe -ArgumentList @(
    "--user-data-dir=$userDataDir",
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    $openUrl
) | Out-Null
