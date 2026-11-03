# 公网部署：前端托管在 Cloudflare Pages（固定地址），后端跑在本机 + quick tunnel
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\cloudflare-pages.ps1 [-Rebuild] [-Project bombcat]
#   -Rebuild  强制重新构建前端（改了前端代码后用；否则 client\dist 存在就直接复用）
# 首次使用: 先运行 `npx wrangler login` 登录 Cloudflare 账号
# 原理: 前端启动时读取 /config.json 里的 gameUrl。quick tunnel 地址每次重启都会变，
#       脚本只把新的 config.json 重新部署到 Pages（未变的静态资源不会重复上传），前端网址保持不变。
# 运行前请先停掉已有的后端（端口 2567 会被占用）。
param(
  [switch]$Rebuild,
  [string]$Project = 'bombcat'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) { $cf = "cloudflared" }

function Get-TunnelUrl([string]$logFile) {
  # cloudflared 的 banner 走 stderr，两个文件都要扫；主机名至少含一个连字符，避免匹配 api.trycloudflare.com
  $pattern = 'https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com'
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    foreach ($f in @($logFile, "$logFile.err")) {
      if (-not (Test-Path $f)) { continue }
      $m = Select-String -Path $f -Pattern $pattern | Select-Object -First 1
      if ($m) { return $m.Matches[0].Value }
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
    Write-Host "  隧道创建失败（第 $attempt 次），重试..."
    if ($proc -and -not $proc.HasExited) { $proc.Kill() }
    Start-Sleep -Seconds 2
  }
  throw "隧道创建失败 3 次，查看日志: $logFile.err"
}

# 0. 检查 wrangler 登录
Push-Location $root
try {
  $who = cmd /c "npx wrangler whoami 2>&1"
  if (($who -join "`n") -match 'not authenticated') {
    throw "尚未登录 Cloudflare：请先运行  npx wrangler login"
  }
} finally { Pop-Location }

Write-Host "[1/5] 启动后端 (:2567)..."
if (Get-NetTCPConnection -LocalPort 2567 -State Listen -ErrorAction SilentlyContinue) {
  throw "端口 2567 已被占用：请先停掉已有的后端/dev 服务"
}
$serverLog = Join-Path $env:TEMP "bombcat-server.log"
Start-Process cmd.exe -ArgumentList '/c', 'npm', 'run', 'dev:server' -WorkingDirectory $root `
  -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err" -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Get-NetTCPConnection -LocalPort 2567 -State Listen -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Milliseconds 500
}
if (-not (Get-NetTCPConnection -LocalPort 2567 -State Listen -ErrorAction SilentlyContinue)) {
  Get-Content $serverLog -Tail 15 -ErrorAction SilentlyContinue
  Get-Content "$serverLog.err" -Tail 15 -ErrorAction SilentlyContinue
  throw "后端 90s 内未监听 :2567"
}
Write-Host "后端已就绪 (:2567)"

Write-Host "[2/5] 启动后端隧道..."
$apiUrl = Start-Tunnel (Join-Path $env:TEMP "bombcat-tunnel-api.log") 2567
$wsUrl = "wss://$(($apiUrl -replace 'https://', ''))"
Write-Host "后端公网地址: $wsUrl"

$dist = Join-Path $root 'client\dist'
if ($Rebuild -or -not (Test-Path (Join-Path $dist 'index.html'))) {
  Write-Host "[3/5] 构建前端..."
  # 运行时配置优先，构建时不写死 VITE_GAME_URL（避免旧的 .env.local 隧道地址被打包进去）
  $envLocal = Join-Path $root 'client\.env.local'
  $envBak = "$envLocal.bak"
  if (Test-Path $envLocal) { Move-Item $envLocal $envBak -Force }
  try {
    Push-Location $root
    cmd /c "npm run build -w @bombcat/client"
    if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
  } finally {
    Pop-Location
    if (Test-Path $envBak) { Move-Item $envBak $envLocal -Force }
  }
} else {
  Write-Host "[3/5] 复用已有构建 client\dist（改了前端代码请加 -Rebuild）"
}

Write-Host "[4/5] 写入 config.json 并部署到 Cloudflare Pages（项目: $Project）..."
"{ `"gameUrl`": `"$wsUrl`" }" | Set-Content -Encoding ascii (Join-Path $dist 'config.json')
Push-Location $root
try {
  $list = cmd /c "npx wrangler pages project list 2>&1"
  if (-not (($list -join "`n") -match "\b$Project\b")) {
    Write-Host "  首次部署：创建 Pages 项目 $Project"
    cmd /c "npx wrangler pages project create $Project --production-branch main"
    if ($LASTEXITCODE -ne 0) { throw "创建 Pages 项目失败" }
  }
  $deployOut = cmd /c "npx wrangler pages deploy client/dist --project-name $Project --branch main --commit-dirty=true 2>&1"
  $deployOut | ForEach-Object { Write-Host "  $_" }
  if ($LASTEXITCODE -ne 0) { throw "Pages 部署失败" }
} finally { Pop-Location }

Write-Host "[5/5] 完成！"
Write-Host ""
Write-Host "=============================================="
Write-Host "  前端地址（发给朋友，固定不变）: https://$Project.pages.dev"
Write-Host "  后端地址（本机隧道，本次有效）: $wsUrl"
Write-Host "=============================================="
Write-Host "提示: 部署后 CDN 可能需要几秒生效；若 $Project 名称已被占用，以上面 wrangler 输出的实际地址为准"
Write-Host "停止: 任务管理器结束 node / cloudflared 进程（或关闭本机），朋友就连不上了"
