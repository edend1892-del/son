@echo off
rem ================================================================
rem  Compile Travee sous Windows.
rem   - Visual Studio : ouvrir "x64 Native Tools Command Prompt", puis build.bat
rem   - MinGW-w64 / MSYS2 : g++ doit etre dans le PATH, puis build.bat
rem ================================================================
cd /d "%~dp0"
if not exist dist mkdir dist
where cl >nul 2>nul
if %errorlevel%==0 (
  cl /nologo /std:c++17 /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE /D_CRT_SECURE_NO_WARNINGS src\main.cpp /Fo:dist\ /Fe:dist\Travee.exe /link /SUBSYSTEM:WINDOWS gdiplus.lib gdi32.lib user32.lib winmm.lib shell32.lib ole32.lib
) else (
  g++ -std=c++17 -O2 -municode -mwindows -static src\main.cpp -o dist\Travee.exe -lgdiplus -lgdi32 -luser32 -lwinmm -lshell32 -lole32
)
if exist dist\Travee.exe echo OK : dist\Travee.exe
