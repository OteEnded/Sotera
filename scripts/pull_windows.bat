@echo off
setlocal
REM Update this clone from git (pulls the repo root).
set "ROOT=%~dp0.."
pushd "%ROOT%" && call git pull && popd
endlocal
