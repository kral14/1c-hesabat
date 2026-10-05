@echo off
chcp 65001 >nul
title GitHub-a Gonderis Skripti - 1c-hesabat
echo ======================================================
echo    1C-Hesabat: GitHub-a Avtomatik Gonderis
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/4] Remote ve veziyyet yoxlanilir...
git remote -v
echo.

set "msg=%~1"
if "%msg%"=="" (
    set /p "msg=Commit mesajini daxil edin (bos qoysaniz avtomatik tarix qoyulacaq): "
)

if "%msg%"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set "msg=Yenilenme: %datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%:%datetime:~12,2%"
)

echo.
echo [2/4] Deyisiklikler elave edilir (git add .)...
git add .

echo.
echo [3/4] Commit edilir: "%msg%"...
git commit -m "%msg%"

echo.
echo [4/4] GitHub-a push edilir (origin main)...
git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================
    echo  [UGURLU] Deyisiklikler ugurla GitHub-a gonderildi!
    echo ======================================================
) else (
    echo.
    echo ======================================================
    echo  [XETA] Push zamani xeta bas verdi. Internet ve ya icazeleri yoxlayin.
    echo ======================================================
)

echo.
pause
