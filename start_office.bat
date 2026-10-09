@echo off
chcp 65001 >nul
echo ========================================================
echo   🟢 1C:ENTERPRISE OFİS SERVERİ VƏ ŞƏBƏKƏ BAĞLANTISI
echo ========================================================
echo.

echo [1/3] Git-dən ən son yeniliklər çəkilir...
git pull

echo.
echo [2/3] Windows Firewall yoxlanılır (Port 5050 icazəsi)...
netsh advfirewall firewall add rule name="1C_Server_5050" dir=in action=allow protocol=TCP localport=5050 >nul 2>&1

echo.
echo [3/3] 1C Arxa Plan Serveri işə salınır (host=0.0.0.0, Port 5050)...
echo Evdən qoşulmaq üçün ünvan: http://172.16.1.63:5050
echo.
python server.py
pause
