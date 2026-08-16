# dsh-agent-router 安装脚本（Windows / PowerShell 5.1+）
# 在线：powershell -ExecutionPolicy Bypass -Command "iex (((irm https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.ps1) -join [Environment]::NewLine).TrimStart([char]0xFEFF))"
# 离线：解压发行包后，在包目录内执行  .\install.ps1 -LocalPath .
# 环境变量 DSH_HOME 可覆盖配置目录（默认 ~/.dsh）；-Profile 指定目标 profile（默认 web）。

param(
  [string]$RepoUrl = 'https://github.com/peterwangze/dsh-agent-router.git',
  [string]$Ref = 'main',
  [string]$LocalPath = '',
  [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$script:PluginName = 'dsh-agent-router'
$script:OldPluginName = 'dsh-router'

function Write-Step([string]$text) { Write-Host "==> $text" }

$homeRaw = $env:DSH_HOME
if (-not $homeRaw) { $homeRaw = Join-Path $env:USERPROFILE '.dsh' }
$dshHome = [System.IO.Path]::GetFullPath($homeRaw)
$src = ''
$offline = $false

# ── 1. 定位源码 ────────────────────────────────────────────────────────
if ($LocalPath) {
  $src = [System.IO.Path]::GetFullPath($LocalPath)
  if (-not (Test-Path (Join-Path $src 'package.json'))) {
    Write-Error "离线安装目录无效：$src 下找不到 package.json（请指向解压后的包根目录）"
  }
  $offline = $true
  Write-Step "离线模式：使用本地源码 $src"
} else {
  $src = Join-Path $dshHome "plugins-src\$script:PluginName"
  if (Test-Path (Join-Path $src '.git')) {
    Write-Step "源码目录已存在，git pull 更新（分支 $Ref）…"
    git -C $src fetch --depth 1 origin $Ref *> $null
    git -C $src checkout -q $Ref
    git -C $src pull -q --ff-only origin $Ref
  } else {
    Write-Step "git clone $RepoUrl（分支 $Ref）…"
    New-Item -ItemType Directory -Path (Split-Path $src -Parent) -Force | Out-Null
    git clone --depth 1 --branch $Ref $RepoUrl $src
  }
}

# ── 2. 链接 / 拷贝到 profiles\node_modules ─────────────────────────────
$nodeModules = Join-Path $dshHome 'profiles\node_modules'
$dst = Join-Path $nodeModules $script:PluginName
$oldDst = Join-Path $nodeModules $script:OldPluginName
New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null

# 旧名迁移：指向同一源码的旧 junction 直接移除，由本脚本以新名重建。
if (Test-Path $oldDst) {
  $item = Get-Item $oldDst -Force
  if ($item.LinkType -or $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    Write-Step "迁移：移除旧链接 $oldDst"
    (Get-Item $oldDst -Force).Delete()
  } else {
    Write-Warning "发现旧目录 $oldDst（非链接）：如不再使用请手动删除"
  }
}

$linked = $false
if (Test-Path $dst) {
  $item = Get-Item $dst -Force
  $isLink = $item.LinkType -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
  if (-not $isLink) {
    Write-Error "$dst 已存在且不是链接：请先手动移除后重试"
  }
  Write-Step "链接已存在：$dst"
  $linked = $true
} else {
  try {
    New-Item -ItemType Junction -Path $dst -Target $src | Out-Null
    Write-Step "已创建 junction：$dst -> $src"
    $linked = $true
  } catch {
    Write-Warning "junction 创建失败（$($_.Exception.Message)）：改用目录拷贝"
  }
}
if (-not $linked) {
  Write-Step "拷贝源码到 $dst …"
  robocopy $src $dst /E /XD .git node_modules .router-files tests /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -gt 7) { Write-Error "拷贝失败（robocopy 退出码 $LASTEXITCODE）" }
  Write-Step "拷贝完成：$dst"
}

# ── 3. 幂等写入 cordis.patch.yml（宿主平面两行：router + tool-router）──
$profileDir = Join-Path $dshHome "profiles\$Profile"
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
$patch = Join-Path $profileDir 'cordis.patch.yml'

function New-PatchTemplate {
  @(
    '# Added by dsh-agent-router installer: host-plane rows for multi-model routing.',
    '# - `router`      : router service + Agent Routing settings page + /api/router/* Remote',
    '# - `tool-router` : route_agent tool + router:agents prompt section (visible to ALL agent presets)',
    '- insert:',
    '    - id: router',
    "      name: $script:PluginName",
    '    - id: tool-router',
    "      name: $script:PluginName/tool",
    ''
  ) -join "`n"
}

function Add-PatchEntry([string[]]$lines, [string]$fileName) {
  # 找到 insert 块并插入两条；找不到则按顶层数组追加一个新 insert 元素。
  $insertIndex = -1
  $insertIndent = 0
  for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*(-\s+)?insert:\s*$') {
      $insertIndex = $i
      $m = [regex]::Match($lines[$i], '^\s*')
      $insertIndent = $m.Value.Length
      break
    }
  }
  if ($insertIndex -lt 0) {
    $newEntry = @(
      '- insert:'
      '    - id: router'
      "      name: $script:PluginName"
      '    - id: tool-router'
      "      name: $script:PluginName/tool"
    )
    # `[]`（空数组 = 禁用层形态）不能与新增条目并存：直接用 insert 条目替换该行。
    for ($i = 0; $i -lt $lines.Length; $i++) {
      if ($lines[$i] -match '^\s*\[\]\s*$') {
        $lines[$i] = $newEntry[0]
        $result = New-Object System.Collections.Generic.List[string]
        for ($j = 0; $j -le $i; $j++) { $result.Add($lines[$j]) }
        for ($j = 1; $j -lt $newEntry.Length; $j++) { $result.Add($newEntry[$j]) }
        for ($j = $i + 1; $j -lt $lines.Length; $j++) { $result.Add($lines[$j]) }
        return $result.ToArray()
      }
    }
    $lines += ''
    $lines += $newEntry
    return $lines
  }
  # 列表尾部 = insert 行之后、下一个顶层数组元素 / 顶层键之前的最后一个条目行。
  $last = $insertIndex
  $itemIndent = -1
  for ($i = $insertIndex + 1; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match '^\s*$' -or $line -match '^\s*#') { continue }
    $m = [regex]::Match($line, '^\s*')
    $indent = $m.Value.Length
    if ($line -match '^\s*-\s') {
      if ($indent -le $insertIndent) { break }
      if ($itemIndent -lt 0) { $itemIndent = $indent }
      $last = $i
    } else {
      if ($indent -le $insertIndent) { break }
      if ($itemIndent -lt 0) { $itemIndent = $indent }
      $last = $i
    }
  }
  if ($itemIndent -lt 0) { $itemIndent = 4 }
  $pad = ' ' * $itemIndent
  $result = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -le $last; $i++) { $result.Add($lines[$i]) }
  $result.Add("${pad}- id: router")
  $result.Add("${pad}  name: $script:PluginName")
  $result.Add("${pad}- id: tool-router")
  $result.Add("${pad}  name: $script:PluginName/tool")
  for ($i = $last + 1; $i -lt $lines.Length; $i++) { $result.Add($lines[$i]) }
  return $result.ToArray()
}

if (-not (Test-Path $patch)) {
  Write-Step "创建 $patch"
  [System.IO.File]::WriteAllText($patch, (New-PatchTemplate), (New-Object System.Text.UTF8Encoding($false)))
} else {
  $content = [System.IO.File]::ReadAllText($patch)
  $updated = $content.Replace("name: $script:OldPluginName", "name: $script:PluginName")
  if ($updated.Contains("name: $script:PluginName") -and $updated -eq $content) {
    Write-Step "$patch 已配置，跳过"
  } elseif ($updated.Contains("name: $script:PluginName")) {
    # 仅完成旧名迁移（原文件里已有对应条目）：直接写回。
    [System.IO.File]::WriteAllText($patch, $updated, (New-Object System.Text.UTF8Encoding($false)))
    Write-Step "已更新 $patch（旧名 $script:OldPluginName 迁移为 $script:PluginName）"
  } else {
    $lines = ($updated -replace "`r`n", "`n").Split("`n")
    $lines = Add-PatchEntry $lines $patch
    [System.IO.File]::WriteAllText($patch, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-Step "已更新 $patch（插入 router / tool-router 宿主行）"
  }
}

Write-Host ''
Write-Host "[OK] dsh-agent-router 安装完成（源码：$src；profile：$Profile）"
Write-Host '  请重启 DSH，然后在「设置 → Agent 路由」添加专业 Agent。'
