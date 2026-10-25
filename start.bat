@echo off
title 优选资源库 - 本地下载服务
cd /d "%~dp0"

echo ============================================
echo   优选资源库 - 启动中...
echo ============================================
echo.

rem 优先使用 py 启动器（系统已安装 Python 3.14）
where py >nul 2>nul
if %errorlevel%==0 (
    set PY=py -3
    goto :run
)
rem 退而使用 python 命令
where python >nul 2>nul
if %errorlevel%==0 (
    set PY=python
    goto :run
)

echo [错误] 未检测到 Python，请先安装 Python 3.8+ 并勾选 "Add to PATH"。
echo 下载地址: https://www.python.org/downloads/
echo.
pause
exit /b 1

:run
echo [信息] 正在启动服务（端口 8000），请稍候...
echo [信息] 启动后浏览器访问 http://127.0.0.1:8000
echo [信息] 关闭本窗口即停止服务。
echo.
%PY% start_server.py
if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务启动失败，请检查 start_server.py 是否存在或端口是否被占用。
    echo.
)
pause
