@echo off
REM =========================================
REM  Agent Gateway 快速啟動腳本
REM  使用方式: 直接雙擊或在 cmd 中執行
REM =========================================

echo [Agent Gateway] 正在啟動...

cd /d "C:\Users\user\.antigravity\AnythingllmSkills"

REM 建立 logs 目錄
if not exist logs mkdir logs

REM 檢查 PM2 是否已安裝
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [Agent Gateway] PM2 未安裝，正在安裝...
    npm install -g pm2
    npm install -g pm2-windows-startup
)

REM 啟動 Gateway
pm2 start ecosystem.config.cjs

REM 顯示狀態
pm2 status

echo.
echo [Agent Gateway] 已啟動！
echo   - 查看日誌: pm2 logs agent-gateway
echo   - 查看狀態: pm2 status
echo   - 停止服務: pm2 stop agent-gateway
echo   - 重啟:     pm2 restart agent-gateway
echo   - 設定開機自啟: pm2 save ^& pm2-startup install
echo.
pause
