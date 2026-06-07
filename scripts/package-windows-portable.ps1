# Portable Windows bundle: embedded Node + built app (optional prune).
#   npm run pack:win-portable
#   npm run pack:win-portable:fat   (-SkipPrune, larger zip)
# Flags:
#   -SkipPrune   Skip npm prune (avoid EPERM if esbuild/rollup locked)
#   -SkipZip     Only create folder under dist-packaging\Veo3Pro (no zip; fastest)
# Env: PACK_NODE_VERSION=v22.14.0

param(
  [switch] $SkipPrune,
  [switch] $SkipZip
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

$NodeVer = if ($env:PACK_NODE_VERSION) { $env:PACK_NODE_VERSION } else { 'v22.14.0' }
$OutRoot = Join-Path $Root 'dist-packaging'
$BundleName = 'Veo3Pro'
$Target = Join-Path $OutRoot $BundleName

Write-Host "==> npm install + build"
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipPrune) {
  Write-Host "==> npm prune --omit=dev (bỏ qua bằng -SkipPrune nếu báo EPERM)"
  npm prune --omit=dev
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "npm prune thất bại (thường do file đang dùng). Chạy lại với -SkipPrune hoặc đóng IDE/antivirus."
    exit $LASTEXITCODE
  }
}

Write-Host "==> Chuẩn bị thư mục $Target"
if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
$AppDir = Join-Path $Target 'app'
$RuntimeDir = Join-Path $Target 'runtime'
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

Write-Host "==> Sao chép app"
Copy-Item (Join-Path $Root 'package.json') $AppDir -Force
Copy-Item (Join-Path $Root 'package-lock.json') $AppDir -Force
Copy-Item (Join-Path $Root '.env.example') $AppDir -Force
Copy-Item (Join-Path $Root 'server') (Join-Path $AppDir 'server') -Recurse -Force
Copy-Item (Join-Path $Root 'dist') (Join-Path $AppDir 'dist') -Recurse -Force
Copy-Item (Join-Path $Root 'node_modules') (Join-Path $AppDir 'node_modules') -Recurse -Force

Write-Host "==> Launcher + hướng dẫn"
Copy-Item (Join-Path $Root 'Veo3Pro.bat') $Target -Force
Copy-Item (Join-Path $Root 'packaging\HUONG-DAN-Veo3Pro.txt') $Target -Force
Copy-Item (Join-Path $Root 'scripts\open-browser-when-ready.ps1') (Join-Path $Target 'open-browser-when-ready.ps1') -Force

Write-Host "==> Tải Node.js Windows x64 $NodeVer"
$NodeZipName = "node-$NodeVer-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/$NodeVer/$NodeZipName"
$CacheDir = Join-Path $OutRoot '.cache'
New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null
$ZipPath = Join-Path $CacheDir $NodeZipName

if (-not (Test-Path $ZipPath)) {
  Invoke-WebRequest -Uri $NodeUrl -OutFile $ZipPath -UseBasicParsing
}

$ExtractDir = Join-Path $CacheDir "extract-$NodeVer"
if (Test-Path $ExtractDir) { Remove-Item $ExtractDir -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

$Inner = Join-Path $ExtractDir "node-$NodeVer-win-x64"
if (-not (Test-Path $Inner)) {
  throw "Không tìm thấy thư mục sau giải nén: node-$NodeVer-win-x64"
}

Copy-Item (Join-Path $Inner '*') $RuntimeDir -Recurse -Force

$ZipOut = Join-Path $OutRoot "${BundleName}-windows-portable.zip"
if (-not $SkipZip) {
  Write-Host "==> Zip (tar -a; co the vai phut voi node_modules)"
  if (Test-Path $ZipOut) { Remove-Item $ZipOut -Force }
  Push-Location $OutRoot
  try {
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
      & tar.exe -a -c -f $ZipOut $BundleName
      if ($LASTEXITCODE -ne 0) { throw "tar exited $LASTEXITCODE" }
    }
    else {
      Compress-Archive -Path $Target -DestinationPath $ZipOut -Force
    }
  }
  finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "Done. Folder: $Target"
if (-not $SkipZip) {
  Write-Host "Zip for customers: $ZipOut"
}
Write-Host "Customer: create app\.env from .env.example (GEMINI_API_KEY), then run Veo3Pro.bat"
