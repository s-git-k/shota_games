@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title つみき王国 - ローカルサーバー

cd /d "%~dp0"

if not exist "package.json" (
  echo [エラー] package.json が見つかりません。
  echo このバッチをプロジェクトのルートフォルダーに置いてください。
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  set "BUNDLED_NODE=%USERPROFILE%\.copilot\tools\node-v20.17.0-win-x64"
  if exist "!BUNDLED_NODE!\node.exe" (
    set "PATH=!BUNDLED_NODE!;!PATH!"
  ) else (
    echo [エラー] Node.js が見つかりません。
    echo https://nodejs.org/ から Node.js 20 以上をインストールしてください。
    pause
    exit /b 1
  )
)

for /f "tokens=1 delims=." %%V in ('node --version') do set "NODE_MAJOR=%%V"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 20 (
  echo [エラー] Node.js 20 以上が必要です。現在のバージョン:
  node --version
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo 初回セットアップとして依存関係をインストールします...
  call npm install
  if errorlevel 1 (
    echo [エラー] npm install に失敗しました。
    pause
    exit /b 1
  )
)

set "OPEN_OPTION=--open"
if /i "%~1"=="--no-open" set "OPEN_OPTION="

echo.
echo つみき王国を起動します。
echo URL: http://127.0.0.1:5173/
echo 終了するには、この画面で Ctrl+C を押してください。
echo.

call npm run dev -- --host 127.0.0.1 --port 5173 %OPEN_OPTION%
if errorlevel 1 (
  echo.
  echo [エラー] サーバーを起動できませんでした。
  echo ポート5173が使用中の場合は、既に起動しているサーバーを終了してください。
  pause
  exit /b 1
)

endlocal
