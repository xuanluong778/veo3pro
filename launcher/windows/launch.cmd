@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Nhan URL day du tu protocol handler (phai goi: launch.cmd "veo3pro://...")
set "URL=%~1"
set "PROFILE_ID=default"
set "OPEN_URL=https://gemini.google.com/app"

REM --- Parse profileId ---
set "PART=!URL:*profileId=!"
if not "!PART!"=="!URL!" (
  for /f "tokens=1 delims=&" %%a in ("!PART!") do set "PROFILE_ID=%%a"
)

REM --- Parse targetUrl (uu tien) hoac appUrl ---
set "PART=!URL:*targetUrl=!"
if not "!PART!"=="!URL!" (
  for /f "tokens=1 delims=&" %%a in ("!PART!") do set "OPEN_URL=%%a"
) else (
  set "PART=!URL:*appUrl=!"
  if not "!PART!"=="!URL!" (
    for /f "tokens=1 delims=&" %%a in ("!PART!") do set "OPEN_URL=%%a"
  )
)

REM Decode %XX co ban (chi can /)
set "OPEN_URL=!OPEN_URL:%%2F=/!"
set "OPEN_URL=!OPEN_URL:%%3A=:!"
set "PROFILE_ID=!PROFILE_ID:%%20= !"

if "!PROFILE_ID!"=="" set "PROFILE_ID=default"
if "!OPEN_URL!"=="" set "OPEN_URL=https://gemini.google.com/app"

REM Moi profile = user-data-dir rieng (on dinh hon --profile-directory)
set "USER_DATA=C:\VEO3PRO\ChromeProfiles\!PROFILE_ID!"
if not exist "!USER_DATA!" mkdir "!USER_DATA!"

set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE set "CHROME_EXE=chrome"

start "" "!CHROME_EXE!" --user-data-dir="!USER_DATA!" --no-first-run --no-default-browser-check --new-window "!OPEN_URL!"

endlocal
