@echo off
REM Helper unit: build the frontend into Backend/public/dist (Fastify serves it).
REM The Fastify backend is plain JS, so there's no backend build step.
setlocal
set "ROOT=%~dp0..\.."

echo Building frontend...
pushd "%ROOT%\Frontend" && call npm run build && popd
endlocal
