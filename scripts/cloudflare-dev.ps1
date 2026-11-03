# 一键公网联机测试：后端(:2567) + 前端(:5173) + 两条 Cloudflare quick tunnel
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\cloudflare-dev.ps1 [-Mode prod]
#        -Mode prod 用打包产物（vite build + preview）：无 dev/HMR 开销，朋友游玩更流畅
# 说明: quick tunnel 地址每次启动都会变（重启后朋友要重新拿链接）；
#       已强制 --protocol http2（QUIC 在国内到 Cloudflare 边缘不稳定）。
#       运行前请先停掉已有的 dev 服务（端口 2567/5173 会被占用）。
param(
  [ValidateSet('dev', 'prod')]
  [string]$Mode = 'dev'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) { $cf = "cloudflared" }

function Get-TunnelUrl([string]$logFile) {
  # cloudflared 的 banner 走 stderr，stdout+stderr 两个文件都要扫。
  # 注意：正则要求主机名至少含一个连字符，避免匹配到错误信息里的 api.trycloudflare.com
  $pattern = 'https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com'
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    foreach ($f in @($logFile, "$logFile.err")) {
      if (-not (Test-Path $f)) { continue }
      $m = Select-String -Path $f -Pattern $pattern | Select-Object -First 1
      if ($m) { return $m.Matches[0].Value }
      # 明确失败（如 Cloudflare API 超时）→ 立即返回空，交给上层重试
      if (Select-String -Path $f -Pattern 'failed to request quick Tunnel' -Quiet) { return $null }
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Start-Tunnel([string]$logFile, [int]$targetPort) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    Remove-Item $logFile -ErrorAction SilentlyContinue
    Remove-Item "$logFile.err" -ErrorAction SilentlyContinue
    $proc = Start-Process $cf -ArgumentList 'tunnel', '--protocol', 'http2', '--url', "http://localhost:$targetPort" `
      -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err" -WindowStyle Hidden -PassThru
    $url = Get-TunnelUrl $logFile
    if ($url) { return $url }
    Write-Host "  隧道创建失败（第 $attempt 次，可能是 Cloudflare API 超时），重试..."
    if ($proc -and -not $proc.HasExited) { $proc.Kill() }
    Start-Sleep -Seconds 2
  }
  throw "隧道创建失败 3 次，查看日志: $logFile.err"
}

Write-Host "[1/6] 启动后端 (:2567)..."
$serverLog = Join-Path $env:TEMP "bombcat-server.log"
# npm 是 npm.cmd，Start-Process 直接重定向它不行，须用 cmd /c 包装
Start-Process cmd.exe -ArgumentList '/c', 'npm', 'run', 'dev:server' -WorkingDirectory $root `
  -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err" -WindowStyle Hidden
# 等 :2567 真正就绪（最多 90s），而不是固定睡 6 秒
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Get-NetTCPConnection -LocalPort 2567 -State Listen -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Milliseconds 500
}
if (-not (Get-NetTCPConnection -LocalPort 2567 -State Listen -ErrorAction SilentlyContinue)) {
  Write-Host "后端 90s 内未监听 :2567，日志尾部:"
  Get-Content $serverLog -Tail 15 -ErrorAction SilentlyContinue
  Get-Content "$serverLog.err" -Tail 15 -ErrorAction SilentlyContinue
  throw "后端启动失败"
}
Write-Host "后端已就绪 (:2567)"

Write-Host "[2/6] 启动后端隧道..."
$logA = Join-Path $env:TEMP "bombcat-tunnel-a.log"
$apiUrl = Start-Tunnel $logA 2567

Write-Host "[3/6] 后端公网地址: $apiUrl"
if ($Mode -eq 'prod') {
  Write-Host "[4/6] 生产模式：写入 client\.env.local，构建前端并 preview (:5173)..."
} else {
  Write-Host "[4/6] 写入 client\.env.local 并启动前端 dev (:5173)..."
}
@"
# Cloudflare quick tunnel 后端地址（本文件由 scripts/cloudflare-dev.ps1 自动生成）
VITE_GAME_URL=wss://$(($apiUrl -replace 'https://', ''))
"@ | Set-Content (Join-Path $root 'client\.env.local')
if ($Mode -eq 'prod') {
  Push-Location (Join-Path $root 'client')
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
  } finally { Pop-Location }
  Start-Process cmd.exe -ArgumentList '/c', 'npm', 'run', '-w', '@bombcat/client', 'preview' -WorkingDirectory $root -WindowStyle Minimized
} else {
  Start-Process cmd.exe -ArgumentList '/c', 'npm', 'run', 'dev:client' -WorkingDirectory $root -WindowStyle Minimized
}
# 等 :5173 就绪（最多 30s）
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Milliseconds 500
}
Write-Host "前端已就绪 (:5173)"

Write-Host "[5/6] 启动前端隧道..."
$logB = Join-Path $env:TEMP "bombcat-tunnel-b.log"
$webUrl = Start-Tunnel $logB 5173

Write-Host "[6/6] 完成！"
Write-Host ""
Write-Host "=============================================="
Write-Host "  前端地址（发给朋友）: $webUrl"
Write-Host "  后端地址（已打包进前端）: $apiUrl"
Write-Host "=============================================="
Write-Host "玩法: 打开前端 → 输昵称 → 创建房间 → 把 4 位房间码发给朋友"
Write-Host "      等待室可调「开局补机器人至 N 人」（默认 4 人，人不够自动补 AI）"
Write-Host "停止: 关闭各最小化窗口（npm/cloudflared），或任务管理器结束 node/cloudflared 进程"
