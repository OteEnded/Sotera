@echo off
setlocal
REM ==========================================================================
REM  Your project's DEV run script (Fastify + React), created at the repo root
REM  by the wizard. Fastify serves the API AND the built frontend at
REM  http://localhost:3000. Installs deps, builds the frontend, then runs the
REM  backend in watch mode.
REM  (This template lives in scripts\launchers\; the wizard copies it to root.)
REM
REM  To HOST on a server, use scripts\server_windows.bat instead.
REM ==========================================================================
set "ROOT=%~dp0"

call "%ROOT%scripts\lib\install_windows.bat"
call "%ROOT%scripts\lib\build_windows.bat"

echo Starting Fastify (dev, watch) on http://localhost:3000 ...
pushd "%ROOT%Backend" && call npm run dev
endlocal
