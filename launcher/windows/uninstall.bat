@echo off
setlocal
echo [VEO3 Launcher] Go protocol veo3pro:// ...
reg import "%~dp0uninstall_protocol.reg"
if errorlevel 1 (
  echo Loi go protocol.
  pause
  exit /b 1
)
echo Da go. File trong C:\VEO3PRO\Launcher van con — xoa thu cong neu can.
pause
endlocal
