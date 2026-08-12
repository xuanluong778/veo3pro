@echo off
REM Test mo profile "admin" khong can web
call "%~dp0launch.cmd" "veo3pro://open-profile?profileId=admin&targetUrl=https%3A%2F%2Fgemini.google.com%2Fapp&appUrl=https%3A%2F%2Fmarketingautoaz.com%2F"
echo Da gui lenh mo Chrome. Kiem tra cua so Chrome profile moi.
pause
