<#
  MSI Thin Board helper - REPOS WORKER (writes data\repos.js for the Repos scene)

  Runs in its own background thread, started by cs-load.ps1. Every $EverySec seconds (and soon after the GitHub username
  setting changes) it:
    1. looks for git repos under your user folder (and cs-links.json extraScanRoots), $ScanDepth levels deep
    2. reads ONLY the text of each repo's .git\config to find its github.com remote
       (never runs git, never reads credentials; any user:token@ part of a URL is dropped)
    3. asks the public GitHub API for the account's public repos (no token; at most once per $GithubEveryMin minutes)
    4. merges both lists and writes data\repos.js

  Private repos: a repo of the account that is cloned here but missing from the COMPLETE public list must be private.
  This is only decided when the public list was fetched successfully, so being offline never turns public repos private.

  GitHub refusals: when GitHub answers with an error (404 unknown user, 403/429 rate limit, ...) 3 times in a row, the
  worker stops asking for that account until the username changes or the helper restarts. Network errors are not counted.

  Can also be run on its own for testing:  .\repos-worker.ps1 -Root <wallpaper folder> -Once 1
#>
param(
  [string]$Root,                                   # the wallpaper folder (data\ and helper\ are inside it)
  [string]$Log,                                    # log file
  [int]$EverySec = 1200,                           # seconds between scans
  [int]$GithubEveryMin = 60,                       # minutes between GitHub API calls
  [int]$ScanDepth = 4,                             # folder levels searched for repos
  [hashtable]$Shared = @{ user = '' },             # shared with the main thread: .user = GitHub username setting
  [int]$Once = 0                                  # 1 = one pass, then return (tests)
)

. (Join-Path $Root 'helper\common.ps1')
if (-not $Log) { $Log = Join-Path $Root 'data\cs-load.log' }
function L([string]$m) { Write-Log $Log 'repos: ' $m }

$reposOut = Join-Path $Root 'data\repos.js'
$linksFile = Join-Path $Root 'helper\cs-links.json'
[System.Threading.Thread]::CurrentThread.Priority = 'BelowNormal'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$epoch = [datetime]::SpecifyKind([datetime]'1970-01-01', [DateTimeKind]::Utc)

# Folders never searched (big, or Windows junction points that loop)
$skipDirs = 'AppData', 'node_modules', 'venv', 'site-packages', '__pycache__', 'Application Data', 'Local Settings',
            'Cookies', 'NetHood', 'PrintHood', 'Recent', 'SendTo', 'Start Menu', 'Templates', 'My Documents'

# Language guessing for repos GitHub does not know (private ones): extension -> language -> colour group -> name
$extLang = @{
  '.py' = 'Python'; '.ipynb' = 'Python'; '.js' = 'JavaScript'; '.ts' = 'TypeScript'; '.html' = 'HTML'; '.css' = 'CSS'
  '.php' = 'PHP'; '.vue' = 'Vue'; '.c' = 'C'; '.h' = 'C'; '.cpp' = 'C++'; '.hpp' = 'C++'; '.cs' = 'C#'; '.java' = 'Java'
  '.rs' = 'Rust'; '.go' = 'Go'; '.v' = 'Verilog'; '.sv' = 'Verilog'; '.md' = 'Markdown'; '.tex' = 'TeX'
}
$langGroup = @{
  'Python' = 'Python'; 'JavaScript' = 'Web'; 'TypeScript' = 'Web'; 'HTML' = 'Web'; 'CSS' = 'Web'; 'PHP' = 'Web'; 'Vue' = 'Web'
  'C' = 'C/C++'; 'C++' = 'C/C++'; 'C#' = 'C/C++'; 'Java' = 'Java'; 'Rust' = 'Rust'; 'Go' = 'Go'; 'Verilog' = 'Verilog'
  'Markdown' = 'Docs'; 'TeX' = 'Docs'
}
$groupName = @{
  'Python' = 'Python'; 'Web' = 'JavaScript'; 'C/C++' = 'C++'; 'Java' = 'Java'; 'Rust' = 'Rust'; 'Go' = 'Go'
  'Verilog' = 'Verilog'; 'Docs' = 'Markdown'
}


# ---------------------------------------------------------------- local repos

# Returns https://github.com/owner/repo for any form of github.com remote, $null for anything else.
function ConvertTo-GithubUrl([string]$u) {
  if (-not $u) { return $null }
  $u = $u.Trim()
  if ($u -match '^git@github\.com:(?<o>[^/\s]+)/(?<r>\S+?)(\.git)?/?$') {
    return 'https://github.com/' + $Matches['o'] + '/' + $Matches['r']
  }
  if ($u -match '^(https?|ssh|git)://([^/@\s]+@)?github\.com(:\d+)?/(?<o>[^/\s]+)/(?<r>\S+?)(\.git)?/?$') {
    return 'https://github.com/' + $Matches['o'] + '/' + $Matches['r']
  }
  return $null
}

# Folders that contain a .git folder, searching $depth levels below $start (depth-first, no recursion limit issues).
function Find-GitRepos([string]$start, [int]$depth) {
  $found = New-Object System.Collections.ArrayList
  $stack = New-Object System.Collections.Stack
  $stack.Push(@($start, 0))
  while ($stack.Count) {
    $cur = $stack.Pop(); $path = $cur[0]; $level = $cur[1]
    try {
      if ([System.IO.Directory]::Exists((Join-Path $path '.git'))) { [void]$found.Add($path); continue }
      if ($level -ge $depth) { continue }
      foreach ($sub in [System.IO.Directory]::EnumerateDirectories($path)) {
        $name = [System.IO.Path]::GetFileName($sub)
        if ($name.StartsWith('.') -or $skipDirs -contains $name) { continue }
        $stack.Push(@($sub, ($level + 1)))   # parentheses: in PowerShell "," binds tighter than "+"
      }
    } catch {}   # no access: skip the folder
  }
  $found
}

# Remote URL (github.com only) and last activity time of one repo.
function Get-RepoInfo([string]$path) {
  $url = $null
  try {
    $config = [System.IO.File]::ReadAllText((Join-Path $path '.git\config'))
    if ($config -match '(?ms)\[remote "origin"\][^\[]*?\burl\s*=\s*(?<u>[^\r\n]+)') { $url = ConvertTo-GithubUrl $Matches['u'] }
  } catch {}
  $time = [int64]0
  foreach ($f in '.git\logs\HEAD', '.git\HEAD') {   # last commit / checkout
    $fp = Join-Path $path $f
    if ([System.IO.File]::Exists($fp)) { $time = [int64]([System.IO.File]::GetLastWriteTimeUtc($fp) - $epoch).TotalSeconds; break }
  }
  [pscustomobject]@{ path = $path; url = $url; time = $time }
}

# Approximate language and size of a local repo from its file extensions (3 levels, at most 1500 files).
function Measure-Repo([string]$path) {
  $count = @{}; $bytes = [int64]0; $files = 0
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue(@($path, 0))
  while ($queue.Count -and $files -lt 1500) {
    $cur = $queue.Dequeue()
    try {
      foreach ($f in [System.IO.Directory]::EnumerateFiles($cur[0])) {
        $files++
        try { $bytes += ([System.IO.FileInfo]$f).Length } catch {}
        $ext = [System.IO.Path]::GetExtension($f).ToLower()
        if (-not $extLang.ContainsKey($ext)) { continue }
        $g = $langGroup[$extLang[$ext]]
        if ($g -eq 'Docs') { $count[$g] = 0.25 + [double]$count[$g] }   # docs count less than code
        else { $count[$g] = 1 + [double]$count[$g] }
      }
      if ($cur[1] -lt 2) {
        foreach ($sub in [System.IO.Directory]::EnumerateDirectories($cur[0])) {
          $name = [System.IO.Path]::GetFileName($sub)
          if (-not $name.StartsWith('.') -and $name -notin 'node_modules', 'venv', '__pycache__') { $queue.Enqueue(@($sub, ($cur[1] + 1))) }
        }
      }
    } catch {}
  }
  $lang = $null
  if ($count.Count) { $lang = $groupName[($count.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key] }
  [pscustomobject]@{ lang = $lang; kb = [int][math]::Round($bytes / 1024) }
}


# ---------------------------------------------------------------- GitHub

# State of the public list:  ok = fetched completely for `user`;  rejected = error answers in a row
$gh = @{ user = ''; list = @(); ok = $false; at = [datetime]::MinValue; failAt = [datetime]::MinValue; rejected = 0 }

function Update-GithubList([string]$owner) {
  if ($owner -ne $gh.user) {   # new account: forget everything about the old one
    $gh.user = $owner; $gh.list = @(); $gh.ok = $false; $gh.at = [datetime]::MinValue; $gh.rejected = 0
  }
  $now = Get-Date
  if (-not $owner -or $gh.rejected -ge 3) { return }
  if (($now - $gh.at).TotalMinutes -lt $GithubEveryMin) { return }   # fresh enough
  if (($now - $gh.failAt).TotalMinutes -lt 5) { return }             # failed recently: retry in 5 minutes
  try {
    $all = @()
    for ($page = 1; $page -le 5; $page++) {   # 100 per page, up to 500 repos
      $uri = "https://api.github.com/users/$owner/repos?per_page=100&sort=pushed&page=$page"
      $headers = @{ 'User-Agent' = 'cs-board-wallpaper'; Accept = 'application/vnd.github+json' }
      # (Windows PowerShell returns the whole JSON array as one object; ForEach-Object unrolls it)
      $res = @(Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 15 | ForEach-Object { $_ })
      $all += $res
      if ($res.Count -lt 100) { break }
    }
    $gh.list = @($all | ForEach-Object {
      [pscustomobject]@{
        url  = [string]$_.html_url
        name = [string]$_.name
        lang = [string]$_.language
        kb   = [int]$_.size
        time = [int64](([datetime]$_.pushed_at).ToUniversalTime() - $epoch).TotalSeconds
      }
    })
    $gh.ok = $true; $gh.at = $now; $gh.rejected = 0
  } catch {
    $gh.failAt = $now
    L "github api: $($_.Exception.Message)"
    if ($_.Exception.Response) {   # GitHub answered with an error status (not a network failure)
      $gh.rejected++
      if ($gh.rejected -ge 3) { L "github api: rejected 3 times for '$owner' - not asking again until the username changes or the helper restarts" }
    }
  }
}


# ---------------------------------------------------------------- one pass

function Invoke-Scan {
  $cfg = $null
  try { if (Test-Path $linksFile) { $cfg = Get-Content $linksFile -Raw -ErrorAction Stop | ConvertFrom-Json } } catch { L "cs-links.json: $($_.Exception.Message)" }

  # 1. local repos
  $roots = @($env:USERPROFILE)
  if ($cfg -and $cfg.extraScanRoots) { $roots += @($cfg.extraScanRoots) }
  $local = @()
  foreach ($r in $roots) {
    if ($r -and [System.IO.Directory]::Exists($r)) { foreach ($p in (Find-GitRepos $r $ScanDepth)) { $local += Get-RepoInfo $p } }
  }
  $local = @($local | Where-Object { $_.url } | Sort-Object path -Unique)

  # 2. whose repos? the Lively setting, then cs-links.json, else the account that appears most in your remotes
  $owner = if ($Shared.user) { [string]$Shared.user }
           elseif ($cfg -and $cfg.githubUser) { [string]$cfg.githubUser }
           else { ($local | ForEach-Object { ($_.url -split '/')[3] } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1).Name }

  # 3. public list
  Update-GithubList $owner

  # 4. merge: public list + this account's local clones (url -> entry)
  $byUrl = @{}
  foreach ($g in $gh.list) {
    $byUrl[$g.url.ToLower()] = @{ name = $g.name; lang = $g.lang; kb = $g.kb; time = $g.time; priv = $false; path = $null }
  }
  foreach ($r in $local) {
    $key = $r.url.ToLower(); $parts = $r.url -split '/'   # https: / / github.com / owner / repo
    if ($byUrl.ContainsKey($key)) {
      $byUrl[$key].time = [math]::Max($byUrl[$key].time, $r.time); $byUrl[$key].path = $r.path
    } elseif ($parts[3] -eq $owner) {
      $byUrl[$key] = @{ name = $parts[4]; lang = ''; kb = 0; time = $r.time; priv = $gh.ok; path = $r.path }   # not in the full public list => private
    }
  }

  # 5. newest 60, in the shape the page expects (same fields as `gh repo list --json`)
  $out = @()
  foreach ($e in ($byUrl.Values | Sort-Object { $_.time } -Descending | Select-Object -First 60)) {
    $lang = $e.lang; $kb = $e.kb
    if ((-not $lang -or $kb -le 0) -and $e.path) {
      $m = Measure-Repo $e.path
      if (-not $lang) { $lang = $m.lang }
      if ($kb -le 0) { $kb = $m.kb }
    }
    $o = [ordered]@{ name = $e.name; isPrivate = [bool]$e.priv; pushedAt = $epoch.AddSeconds($e.time).ToString('yyyy-MM-ddTHH:mm:ssZ') }
    if ($lang) { $o.primaryLanguage = [ordered]@{ name = $lang } }
    if ($kb -gt 0) { $o.diskUsage = [int]$kb }
    $out += $o
  }

  $ownerJson = ConvertTo-Json -InputObject ([string]$owner) -Compress
  $listJson = ConvertTo-Json -InputObject ([object[]]$out) -Compress -Depth 4
  [pscustomobject]@{
    count = $out.Count; owner = $owner
    js = "window.REPOS_OWNER = $ownerJson; window.REPOS_DATA = $listJson; window.__csReposLoaded && window.__csReposLoaded();"
  }
}


# ---------------------------------------------------------------- loop

$lastJs = ''
while ($true) {
  $userAtScan = $Shared.user
  try {
    $r = Invoke-Scan
    if ($r.js -ne $lastJs) {   # rewrite only when something changed
      $lastJs = $r.js
      Write-FileSafe $reposOut $r.js
      L "repos.js updated: $($r.count) repos ($($r.owner))"
    }
  } catch { L "scan failed: $($_.Exception.Message)" }
  if ($Once) { return }
  [GC]::Collect()
  # sleep, but wake early when the GitHub username setting changes
  for ($s = 0; $s -lt $EverySec -and $Shared.user -eq $userAtScan; $s += 5) { Start-Sleep -Seconds 5 }
}
