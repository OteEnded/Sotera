@echo off
setlocal
REM ==========================================================================
REM  Setup wizard (Windows). Run this once after cloning. It asks which OS you
REM  want a root run script for and creates only that one, so you have a single
REM  "run" file at the repo root to start the project in development.
REM  Re-runnable. Server / deploy scripts live in the scripts\ folder.
REM ==========================================================================
set "ROOT=%~dp0"

echo(
echo   Project setup wizard
echo   --------------------
echo   Which OS do you want a root run script for?
echo(
echo     [1] Windows   (creates run_windows.bat)
echo     [2] Linux     (creates run_linux.sh)
echo     [3] Both
echo(
set "CHOICE="
set /p "CHOICE=  Enter 1, 2, or 3: "

set "OK=0"
if "%CHOICE%"=="1" ( call :win & set "OK=1" )
if "%CHOICE%"=="2" ( call :lin & set "OK=1" )
if "%CHOICE%"=="3" ( call :win & call :lin & set "OK=1" )

if not "%OK%"=="1" (
  echo(
  echo   Invalid choice. Run the wizard again and enter 1, 2, or 3.
  exit /b 1
)

echo(
echo   Done. Start development by running your root run script.
echo   Server / deploy scripts are in the scripts\ folder ^(server_*, pull_*^).
exit /b 0

:win
copy /Y "%ROOT%scripts\launchers\run_windows.bat" "%ROOT%run_windows.bat" >nul
echo   Created run_windows.bat
exit /b

:lin
copy /Y "%ROOT%scripts\launchers\run_linux.sh" "%ROOT%run_linux.sh" >nul
echo   Created run_linux.sh
exit /b
