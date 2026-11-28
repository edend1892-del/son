#!/usr/bin/env bash
# Compile Travée en exécutable Windows 64 bits (PE32+) avec MinGW-w64.
#   Ubuntu/Debian : sudo apt install g++-mingw-w64-x86-64-posix
set -e
cd "$(dirname "$0")"
mkdir -p dist
CXX=${CXX:-x86_64-w64-mingw32-g++-posix}
command -v "$CXX" >/dev/null || CXX=x86_64-w64-mingw32-g++
"$CXX" -std=c++17 -O2 -municode -mwindows -static -static-libgcc -static-libstdc++ \
    -Wall -Wno-unused-function \
    src/main.cpp -o dist/Travee.exe \
    -lgdiplus -lgdi32 -luser32 -lwinmm -lshell32 -lole32
echo "OK : dist/Travee.exe"
