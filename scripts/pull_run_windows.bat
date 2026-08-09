@echo off
setlocal
REM Update this clone from git, then build + run for the server.
call "%~dp0pull_windows.bat"
call "%~dp0server_windows.bat"
endlocal
