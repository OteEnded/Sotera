@echo off
setlocal
REM ==========================================================================
REM  SERVER launcher for Windows (Fastify + React). Build + run in production
REM  mode, for hosting a clone on a server. Installs deps, builds the frontend,
REM  then runs the Fastify backend (which serves the API + built frontend) with
REM  NODE_ENV=production at http://localhost:3000.
REM  Tip: for a real deployment run it under a service manager (pm2 / nssm).
REM ==========================================================================
set "HERE=%~dp0"
set "ROOT=%~dp0.."

call "%HERE%lib\install_windows.bat"
call "%HERE%lib\build_windows.bat"

set "NODE_ENV=production"
echo Starting Fastify (production) on http://localhost:3000 ...
pushd "%ROOT%\Backend" && call npm start
endlocal
