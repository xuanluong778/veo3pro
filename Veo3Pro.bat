@echo off

chcp 65001 >nul

setlocal

title Veo3 Pro

cd /d "%~dp0"



REM FFmpeg tùy chọn: tools\ffmpeg\bin\ffmpeg.exe

if exist "%~dp0tools\ffmpeg\bin" set "PATH=%~dp0tools\ffmpeg\bin;%PATH%"



REM === Bản portable: cùng cấp có app\ và runtime\ ===

if exist "%~dp0app\server\index.js" goto PORTABLE



REM === Mã nguồn / cài đặt thường: server\ ngay dưới thư mục này ===

if exist "%~dp0server\index.js" goto DEV



echo [Lỗi] Không tìm thấy server: cần app\server\index.js ^(portable^) hoặc server\index.js ^(dev^).

pause

exit /b 1



:PORTABLE

if not exist "%~dp0runtime\node.exe" (

  echo [Lỗi] Thiếu runtime\node.exe — chạy npm run pack:win-portable hoặc cài Node vào runtime\

  pause

  exit /b 1

)

if not exist "%~dp0app\.env" (

  echo.

  echo [Cấu hình] Chưa có app\.env

  echo — Vào app\, copy .env.example thành .env, điền GEMINI_API_KEY

  echo — Chi tiết: HUONG-DAN-Veo3Pro.txt ^(trong bản zip^) hoặc .env.example

  echo.

  pause

  exit /b 1

)

set "NODE_RUN=%~dp0runtime\node.exe"

set "SERVER_JS=%~dp0app\server\index.js"

goto RUN



:DEV

where node >nul 2>nul || (

  echo [Lỗi] Cần Node.js trong PATH — https://nodejs.org/

  pause

  exit /b 1

)

if not exist "%~dp0.env" (

  echo [Cấu hình] Chưa có .env ở thư mục gốc — copy .env.example thành .env và điền GEMINI_API_KEY

  pause

  exit /b 1

)

set "NODE_RUN=node"

set "SERVER_JS=%~dp0server\index.js"



:RUN

REM Đọc PORT từ .env ^(ưu tiên app\.env nếu có — portable^)

set "ENV_FOR_PORT=%~dp0.env"

if exist "%~dp0app\.env" set "ENV_FOR_PORT=%~dp0app\.env"

set PORT_UI=8787

for /f "usebackq tokens=2 delims==" %%P in (`findstr /b /i "PORT=" "%ENV_FOR_PORT%" 2^>nul`) do set "PORT_UI=%%P"

set "PORT_UI=%PORT_UI: =%"



echo.

echo === Veo3 Pro ===

echo Giao diện web: http://127.0.0.1:%PORT_UI%

echo Đang chờ máy chủ — trình duyệt sẽ mở tự động khi cổng %PORT_UI% sẵn sàng.

echo Dừng: Ctrl+C hoặc đóng cửa sổ này

echo.



set "OPEN_PS=%~dp0open-browser-when-ready.ps1"

if not exist "%OPEN_PS%" set "OPEN_PS=%~dp0scripts\open-browser-when-ready.ps1"

if exist "%OPEN_PS%" (

  start "" powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%OPEN_PS%" -Port %PORT_UI%

  goto START_NODE

)

REM Fallback: không có script PowerShell

start "" cmd /c "timeout /t 8 /nobreak >nul && start http://127.0.0.1:%PORT_UI%/"



:START_NODE

"%NODE_RUN%" "%SERVER_JS%"

if errorlevel 1 pause

endlocal

