/**
 * Bat du phong (menu ⋮) — cùng logic profile với VEO3 Launcher: C:\VEO3PRO\ChromeProfiles
 */

export function buildChromeProtocolSetupBat() {
  return [
    '@echo off',
    'echo VEO3 Launcher da chuyen sang goi ZIP.',
    'echo Tai VEO3_Launcher_Setup.zip tu https://marketingautoaz.com va chay install.bat',
    'pause',
    '',
  ].join('\r\n');
}

/** Bat mo profile (du phong — chi tai khi nguoi dung yeu cau trong menu). */
export function buildChromeOpenProfileBat(profileSlug) {
  const slug = String(profileSlug || 'default').trim() || 'default';
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '-');

  return [
    '@echo off',
    'setlocal',
    `set "USER_DATA=C:\\VEO3PRO\\ChromeProfiles\\${safe}"`,
    'if not exist "%USER_DATA%" mkdir "%USER_DATA%"',
    'set "CHROME_EXE="',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME_EXE=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined CHROME_EXE if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined CHROME_EXE set "CHROME_EXE=chrome"',
    'start "" "%CHROME_EXE%" --user-data-dir="%USER_DATA%" --no-first-run --no-default-browser-check --new-window https://gemini.google.com/app',
    'endlocal',
    '',
  ].join('\r\n');
}
