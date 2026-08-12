@echo off
setlocal EnableExtensions
set "ROOT=C:\VEO3PRO"
set "DEST=%ROOT%\Launcher"
set "PROFILES=%ROOT%\ChromeProfiles"
set "SRC=%~dp0"

echo.
echo [VEO3 Launcher] Dang cai dat protocol veo3pro:// ...
echo.

if not exist "%DEST%" mkdir "%DEST%"
if not exist "%PROFILES%" mkdir "%PROFILES%"

copy /Y "%SRC%launch.cmd" "%DEST%\" >nul
if errorlevel 1 (
  echo Loi: khong copy duoc launch.cmd
  pause
  exit /b 1
)
copy /Y "%SRC%launch.ps1" "%DEST%\" >nul

REM Dang ky protocol (reg import + reg add du phong)
reg import "%SRC%install_protocol.reg" >nul 2>&1
set "LAUNCH=%DEST%\launch.cmd"
reg add "HKCU\Software\Classes\veo3pro" /ve /d "URL:VEO3 Launcher Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\veo3pro" /v "URL Protocol" /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\veo3pro\shell\open\command" /ve /d "\"%LAUNCH%\" \"%%1\"" /f >nul 2>&1

reg query "HKCU\Software\Classes\veo3pro\shell\open\command" >nul 2>&1
if errorlevel 1 (
  echo Loi dang ky protocol. Thu chay install_protocol.reg bang double-click.
  pause
  exit /b 1
)

echo [VEO3 Launcher] Da cai xong.
echo   Launcher:  %DEST%
echo   Profiles:  %PROFILES%\^<profileId^>
echo.
echo Mo https://marketingautoaz.com/ - Cai dat - Profile ^& Gmail Ultra - bam "Mo Chrome".
echo.
pause
endlocal
