<#
  千纹万象 · 本地静态服务器（Windows 内置，无需 Python）
  ------------------------------------------------------------------
  作品必须经 http:// 打开：file:// 下浏览器会因本地图片污染 canvas，
  导致 PNG/SVG 导出与 AI 取图全部失效。

  取径顺序（自动降级，任何一层成功即可运行）：
    1. 本机有 Python 3  ->  python -m http.server（最成熟）
    2. 否则             ->  PowerShell HttpListener
    3. HttpListener 失败 ->  TcpListener 自实现（完全不需要权限）

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 8765
  可选：
    -ForceNative   忽略 Python，强制用内置服务器
    -ForceTcp      跳过 HttpListener，直接用 TcpListener（排障用）
    -NoBrowser     不自动打开浏览器
#>
param(
  [int]$Port = 8765,
  [string]$Root = "",
  [switch]$ForceNative,
  [switch]$ForceTcp,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = $PSScriptRoot }
$Root = (Resolve-Path -LiteralPath $Root).Path
$Url  = "http://localhost:$Port/"

function Info($m) { Write-Host "[i] $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[x] $m" -ForegroundColor Red }

$Mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8"
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8"
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8"
  ".md"="text/plain; charset=utf-8"; ".txt"="text/plain; charset=utf-8"
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"
  ".webp"="image/webp"; ".bmp"="image/bmp"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"
  ".mp4"="video/mp4"; ".webm"="video/webm"; ".mp3"="audio/mpeg"; ".wav"="audio/wav"
  ".woff"="font/woff"; ".woff2"="font/woff2"; ".ttf"="font/ttf"; ".otf"="font/otf"
  ".pdf"="application/pdf"; ".zip"="application/zip"
}

function Get-ContentType([string]$p) {
  $e = [System.IO.Path]::GetExtension($p).ToLowerInvariant()
  if ($Mime.ContainsKey($e)) { return $Mime[$e] }
  return "application/octet-stream"
}

# 解析请求路径 -> 绝对文件路径；拒绝目录穿越
function Resolve-Target([string]$urlPath) {
  try { $p = [System.Uri]::UnescapeDataString($urlPath) } catch { $p = $urlPath }
  $p = ($p -split "\?")[0]
  $p = $p.TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($p)) { $p = "index.html" }
  $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($p -replace "/", "\")))
  if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  if (Test-Path -LiteralPath $full -PathType Container) {
    $full = Join-Path $full "index.html"
  }
  return $full
}

function Open-Browser {
  if ($NoBrowser) { return }
  try { Start-Process $Url | Out-Null } catch { Warn "无法自动打开浏览器，请手动访问 $Url" }
}

function Wait-Port([int]$TimeoutMs = 20000) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
    $c = $null
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $c.Connect("127.0.0.1", $Port)
      $c.Close()
      return $true
    } catch {
      if ($c) { try { $c.Close() } catch {} }
      Start-Sleep -Milliseconds 250
    }
  }
  return $false
}

# 上次会话残留的服务进程（强制关窗可能留下）已抢占本端口时先处理。
# Windows 的 SO_REUSEADDR 允许第二个进程绑定同一端口，若不检测会出现
# 「两个服务同时监听 8765」的怪状态（页面时好时坏、关窗也关不干净）。
# 识别方式用「进程命令行」而不是端口枚举——实测双监听时
# Get-NetTCPConnection 只会报出其中一个，不能依赖它。
# 只清理确认属于本作品的 python _serve.py / http.server；别人的程序
# 占用端口则明确报错退出，绝不误杀。
function Clear-StaleListener {
  $stale = @()
  try {
    $pat = '(_serve\.py|http\.server)\s+' + $Port + '(\s|$)'
    $stale = @(Get-CimInstance Win32_Process -Filter "name='python.exe' or name='py.exe' or name='pythonw.exe'" |
      Where-Object { $_.CommandLine -and ($_.CommandLine -match $pat) })
  } catch {}
  foreach ($p in $stale) {
    Info "清理上次残留的服务进程（PID $($p.ProcessId)）——多半是强制关窗留下的。"
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
  if ($stale.Count -gt 0) { Start-Sleep -Milliseconds 500 }

  $conns = @()
  try { $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) } catch { return }
  foreach ($c in $conns) {
    $name = "?"
    try { $name = (Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue).ProcessName } catch {}
    Fail "端口 $Port 仍被其他程序占用（$name，PID $($c.OwningProcess)）。请先关闭它再启动，否则页面会时好时坏。"
    exit 1
  }
}

# ---------------------------------------------------------------- 1. Python
function Try-Python {
  if ($ForceNative) { return $false }
  $exe = $null
  foreach ($n in @("python", "py")) {
    $c = Get-Command $n -ErrorAction SilentlyContinue
    if ($c) { $exe = $c.Source; break }
  }
  if (-not $exe) { return $false }

  Info "使用 Python 内置静态服务：$exe"
  # 优先用 no-store 包装脚本：python -m http.server 不发缓存头，浏览器会启发式
  # 缓存 index.html，改版后仍显示旧脚本（实测踩过）；包装层对所有响应加 no-store。
  # 包装文件缺失时回退原生 http.server（功能不受影响，仅可能命中浏览器缓存）。
  $wrapper = Join-Path $Root "_serve.py"
  if (Test-Path -LiteralPath $wrapper) {
    $args = @((Resolve-Path -LiteralPath $wrapper).Path, "$Port")
  } else {
    $args = @("-m", "http.server", "$Port")
  }
  $child = $null
  try {
    $child = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $Root -NoNewWindow -PassThru
  } catch {
    Warn "Python 启动失败：$($_.Exception.Message)"
    return $false
  }
  if (-not (Wait-Port)) {
    Warn "Python 服务在超时内未监听端口，改用内置服务器。"
    try { if ($child -and -not $child.HasExited) { Stop-Process -Id $child.Id -Force } } catch {}
    return $false
  }
  Info "服务已就绪：$Url"
  Open-Browser
  Write-Host ""
  Write-Host "  按 Ctrl+C 或直接关闭本窗口即可停止服务。" -ForegroundColor DarkGray
  try { Wait-Process -Id $child.Id -ErrorAction SilentlyContinue } catch {}
  try { if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force } } catch {}
  return $true
}

# ------------------------------------------------- 2. HttpListener（原生）
function Send-HttpListener($ctx, [string]$target) {
  $res = $ctx.Response
  $res.Headers["Cache-Control"] = "no-store"
  if ($null -eq $target -or -not (Test-Path -LiteralPath $target -PathType Leaf)) {
    $res.StatusCode = 404
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $res.ContentType = "text/plain; charset=utf-8"
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    return
  }
  $bytes = [System.IO.File]::ReadAllBytes($target)
  $res.StatusCode = 200
  $res.ContentType = Get-ContentType $target
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Run-HttpListener {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add($Url)
  $l.Start()
  return $l
}

# ------------------------------------------- 3. TcpListener（最后的兜底）
function Send-Tcp($client) {
  $stream = $client.GetStream()
  # 首次读取最多等 700ms：浏览器会开预连接而不发请求，
  # 若不设短超时，accept 循环会被这类空连接卡住，页面加载会明显变慢。
  $client.ReceiveTimeout = 700
  $client.SendTimeout = 15000

  # 读取请求头（到空行为止）
  $buf = New-Object byte[] 8192
  $sb = New-Object System.Text.StringBuilder
  while ($true) {
    $n = 0
    try { $n = $stream.Read($buf, 0, $buf.Length) } catch { return }   # 超时/断开：静默关闭
    if ($n -le 0) { return }
    [void]$sb.Append([System.Text.Encoding]::ASCII.GetString($buf, 0, $n))
    if ($sb.ToString() -match "\r\n\r\n") { break }
    if ($sb.Length -gt 65536) { break }
  }

  $head = $sb.ToString()
  $target = $null
  $status = 400
  $body = [System.Text.Encoding]::UTF8.GetBytes("400 Bad Request")
  $ctype = "text/plain; charset=utf-8"
  $headLine = ($head -split "\r\n")[0]
  $parts = $headLine -split " "
  if ($parts.Length -ge 2 -and $parts[0] -eq "GET") {
    $target = Resolve-Target $parts[1]
    if ($null -ne $target -and (Test-Path -LiteralPath $target -PathType Leaf)) {
      $body = [System.IO.File]::ReadAllBytes($target)
      $ctype = Get-ContentType $target
      $status = 200
    } else {
      $status = 404
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $ctype = "text/plain; charset=utf-8"
    }
  }

  $reason = if ($status -eq 200) { "OK" } elseif ($status -eq 404) { "Not Found" } else { "Bad Request" }
  $header = "HTTP/1.1 $status $reason`r`n" +
            "Content-Type: $ctype`r`n" +
            "Content-Length: $($body.Length)`r`n" +
            "Cache-Control: no-store`r`n" +
            "Connection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Run-Native {
  # 先试 HttpListener
  $l = $null
  if ($ForceTcp) {
    Warn "已指定 -ForceTcp，跳过 HttpListener，直接使用 TcpListener。"
  } else {
    try {
      $l = Run-HttpListener
    } catch {
      Warn "HttpListener 不可用（$($_.Exception.Message.Trim())），回退到 TcpListener。"
      $l = $null
    }
  }

  if ($l) {
    Info "使用内置 HttpListener 提供服务。"
    Info "服务已就绪：$Url"
    Open-Browser
    Write-Host ""
    Write-Host "  按 Ctrl+C 或直接关闭本窗口即可停止服务。" -ForegroundColor DarkGray
    while ($l.IsListening) {
      $ctx = $null
      try { $ctx = $l.GetContext() } catch { break }
      try {
        $t = Resolve-Target $ctx.Request.Url.AbsolutePath
        Send-HttpListener $ctx $t
      } catch {
      } finally {
        try { $ctx.Response.OutputStream.Close() } catch {}
        try { $ctx.Response.Close() } catch {}
      }
    }
    try { $l.Stop(); $l.Close() } catch {}
    return
  }

  # 兜底：TcpListener
  $tcp = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
  $tcp.Start()
  Info "使用内置 TcpListener 提供服务（不依赖任何系统组件）。"
  Info "服务已就绪：$Url"
  Open-Browser
  Write-Host ""
  Write-Host "  按 Ctrl+C 或直接关闭本窗口即可停止服务。" -ForegroundColor DarkGray
  while ($true) {
    $client = $null
    try { $client = $tcp.AcceptTcpClient() } catch { break }
    try { Send-Tcp $client } catch {} finally { try { $client.Close() } catch {} }
  }
  try { $tcp.Stop() } catch {}
}

# ------------------------------------------------------------------ 主流程
Write-Host ""
Write-Host "  千纹万象 · 本地服务" -ForegroundColor White
Write-Host "  作品目录：$Root" -ForegroundColor DarkGray
Write-Host "  访问地址：$Url" -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path -LiteralPath (Join-Path $Root "index.html"))) {
  Fail "在 $Root 下找不到 index.html，请把 serve.ps1 放在作品根目录。"
  exit 1
}

Clear-StaleListener
if (Try-Python) { exit 0 }
Run-Native