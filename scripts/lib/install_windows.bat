@echo off
REM Helper unit: install backend + frontend deps if node_modules is missing.
REM Called by the run/server scripts; not meant to be run directly.
setlocal
set "ROOT=%~dp0..\.."

if not exist "%ROOT%\Backend\node_modules" (
  echo Installing backend dependencies...
  pushd "%ROOT%\Backend" && call npm install && popd
)
if not exist "%ROOT%\Frontend\node_modules" (
  echo Installing frontend dependencies...
  pushd "%ROOT%\Frontend" && call npm install && popd
)
endlocal
