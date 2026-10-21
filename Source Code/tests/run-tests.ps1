<#
  CS Board - all tests in one run.   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
  (Windows PowerShell 5.1, the same engine the helper runs on.) Changes nothing outside a temp folder.

    1. syntax        every .js file (node --check, skipped without Node.js) and every .ps1 file (PowerShell parser)
    2. CsSys         compiles helper\CsSys.cs and checks the load.js line it produces
    3. repos worker  runs helper\repos-worker.ps1 once on a fake user folder with fake repos
    4. local port    starts helper\port-listener.ps1 on a free port and sends it good and bad requests
    5. installer     helper\install.ps1 -DryRun (only reports which Lively copy it would use)
    6. browser       opens index.html?test in headless Edge/Chrome with tests\fixtures as the helper's data;
                     tests\browser-tests.js checks the page's logic, widgets, scenes, themes and quality levels
  Exit code = number of failed checks.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('csboard-tests-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $tmp | Out-Null
$script:pass = 0; $script:fail = 0

function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $name  $detail" -ForegroundColor Red }
}
function Section([string]$title) { Write-Host "`n$title" -ForegroundColor Cyan }
function Run-PS([string]$file, [string[]]$arguments) {   # a child Windows PowerShell; returns its output lines (stdout + stderr)
  $ErrorActionPreference = 'Continue'                    # stderr text from the child is output, not a failure of this script
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file @arguments 2>&1 | ForEach-Object { "$_" }
}


# ============================================================ 1. syntax
Section '1. Syntax'
$node = Get-Command node -ErrorAction SilentlyContinue
$jsFiles = @(Get-ChildItem (Join-Path $root 'js'), (Join-Path $root 'tests') -Recurse -Filter *.js) + @(Get-Item (Join-Path $root 'snippets.example.js'))
if ($node) {
  $bad = @($jsFiles | Where-Object { & node --check $_.FullName 2>$null; $LASTEXITCODE -ne 0 } | ForEach-Object { $_.Name })
  Check "JavaScript: $($jsFiles.Count) files" ($bad.Count -eq 0) ($bad -join ', ')
} else { Write-Host '  SKIP  JavaScript (Node.js not installed)' -ForegroundColor Yellow }

$psFiles = @(Get-ChildItem (Join-Path $root 'helper'), (Join-Path $root 'tests') -Recurse -Filter *.ps1)
$bad = @(foreach ($f in $psFiles) {
  $errs = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$errs)
  if ($errs.Count) { "$($f.Name): $($errs[0].Message)" }
})
Check "PowerShell: $($psFiles.Count) files" ($bad.Count -eq 0) ($bad -join ' | ')

foreach ($j in 'LivelyInfo.json', 'LivelyProperties.json', 'helper\cs-links.json') {
  $ok = $true; try { Get-Content (Join-Path $root $j) -Raw | ConvertFrom-Json | Out-Null } catch { $ok = $false }
  Check "JSON: $j" $ok
}


# ============================================================ 2. CsSys (system reader)
Section '2. CsSys system reader'
$csc = @('Framework64', 'Framework') | ForEach-Object { Join-Path $env:WINDIR "Microsoft.NET\$_\v4.0.30319\csc.exe" } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
$dll = Join-Path $tmp 'CsSys.dll'
& $csc /nologo /target:library "/out:$dll" (Join-Path $root 'helper\CsSys.cs') | Out-Null
Check 'compiles with the Windows C# compiler' (Test-Path $dll)
$probe = Join-Path $tmp 'cssys-probe.ps1'
Set-Content $probe @"
[void][Reflection.Assembly]::LoadFrom('$dll')
[CsSys]::Init(); [CsSys]::Extra = ',hw:{cpu:"x"}'
[void][CsSys]::Line('k1', -1); Start-Sleep -Milliseconds 1200
'SOURCE ' + [CsSys]::GpuSource
[CsSys]::Line('k1', -1)
[CsSys]::Line('k1', 77)
"@
$out = Run-PS $probe @()
$line = $out | Where-Object { $_ -like 'window.__csLoad*' } | Select-Object -First 1
$pattern = "^window\.__csLoad && window\.__csLoad\(\d+,-?\d+,\{k:'k1',b:-?\d+,c:[01],bt:-?\d+,ram:[\d.]+,ru:[\d.]+,rt:[\d.]+,dk:\d+,df:[\d.]+,dl:'[A-Z]',dn:\d+,up:\d+,hw:\{cpu:`"x`"\}\}\);$"
Check 'load.js line has the expected format' ($line -match $pattern) $line
Check 'GPU override (nvidia-smi fallback) is used' ((($out | Where-Object { $_ -like 'window.__csLoad*' })[1]) -match '^window\.__csLoad && window\.__csLoad\(\d+,77,')
Write-Host "        GPU source on this PC: $(($out | Where-Object { $_ -like 'SOURCE *' }) -replace 'SOURCE ')"


# ============================================================ 3. repos worker
Section '3. Repos worker (fake user folder)'
$fakeRoot = Join-Path $tmp 'wallpaper'
$fakeHome = Join-Path $tmp 'home'
New-Item -ItemType Directory (Join-Path $fakeRoot 'helper'), (Join-Path $fakeRoot 'data') | Out-Null
Copy-Item (Join-Path $root 'helper\common.ps1'), (Join-Path $root 'helper\repos-worker.ps1') (Join-Path $fakeRoot 'helper')
function New-FakeRepo([string]$path, [string]$url) {
  New-Item -ItemType Directory (Join-Path $path '.git') -Force | Out-Null
  Set-Content (Join-Path $path '.git\config') "[core]`n`tbare = false`n[remote `"origin`"]`n`turl = $url`n`tfetch = +refs/heads/*:refs/remotes/origin/*"
  Set-Content (Join-Path $path 'main.py') 'print(1)'
}
New-FakeRepo (Join-Path $fakeHome 'code\Hello-World') 'git@github.com:octocat/Hello-World.git'                              # public, ssh form
New-FakeRepo (Join-Path $fakeHome 'code\zz-private-test') 'https://someone:ghp_FAKETOKEN123@github.com/octocat/zz-private-test.git'  # token in URL
New-FakeRepo (Join-Path $fakeHome 'school\other-owner') 'https://github.com/someone-else/other-owner'                          # other account
New-FakeRepo (Join-Path $fakeHome 'AppData\skipped') 'https://github.com/octocat/skipped-repo'                                # in a skipped folder
New-FakeRepo (Join-Path $fakeHome 'a\b\c\d\e\too-deep') 'https://github.com/octocat/too-deep'                                 # deeper than 4 levels

$savedProfile = $env:USERPROFILE
$env:USERPROFILE = $fakeHome          # the child process scans this fake folder instead of yours
try { $null = Run-PS (Join-Path $fakeRoot 'helper\repos-worker.ps1') @('-Root', $fakeRoot, '-Once', '1') }
finally { $env:USERPROFILE = $savedProfile }

$reposJs = Join-Path $fakeRoot 'data\repos.js'
$text = if (Test-Path $reposJs) { Get-Content $reposJs -Raw } else { '' }
$logText = if (Test-Path (Join-Path $fakeRoot 'data\cs-load.log')) { Get-Content (Join-Path $fakeRoot 'data\cs-load.log') -Raw } else { '' }
$online = $logText -notmatch 'github api:'
Check 'writes data\repos.js' ($text -ne '')
Check 'owner guessed from the remotes: octocat' ($text -match 'window\.REPOS_OWNER = "octocat"')
Check 'finds local repos (ssh and https remotes)' ($text -match '"Hello-World"' -and $text -match '"zz-private-test"')
$wrong = [regex]::Matches($text, 'other-owner|skipped-repo|too-deep') | ForEach-Object { $_.Value }
Check 'ignores other accounts, skipped folders, too-deep repos' (-not $wrong) ($wrong -join ', ')
Check 'never writes a token from a remote URL' ($text -notmatch 'FAKETOKEN' -and $logText -notmatch 'FAKETOKEN')
if ($online) {
  Check 'online: a clone missing from the public list is private' ($text -match '"name":"zz-private-test","isPrivate":true')
  Check 'online: public repos come from GitHub too' (([regex]::Matches($text, '"pushedAt"')).Count -gt 2)
} else {
  Check 'offline: nothing is marked private' ($text -notmatch '"isPrivate":true')
  Write-Host '        (GitHub not reachable: the online checks were skipped)' -ForegroundColor Yellow
}


# ============================================================ 4. local port
Section '4. Local port (music buttons + GitHub setting)'
$l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0); $l.Start(); $port = $l.LocalEndpoint.Port; $l.Stop()
$portLog = Join-Path $tmp 'port.log'
$userFile = Join-Path $tmp 'port-user.txt'
$wrapper = Join-Path $tmp 'port-run.ps1'
Set-Content $wrapper @"
`$shared = [hashtable]::Synchronized(@{ key = 'testkey'; user = 'start' })
`$ps = [powershell]::Create()
[void]`$ps.AddScript([IO.File]::ReadAllText('$root\helper\port-listener.ps1')).AddArgument('$root').AddArgument('$portLog').AddArgument($port).AddArgument(`$shared).AddArgument(`$null).AddArgument(`$null)
[void]`$ps.BeginInvoke()
while (`$true) { Set-Content '$userFile' `$shared.user; Start-Sleep -Milliseconds 100 }
"@
$child = Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$wrapper`"" -WindowStyle Hidden -PassThru
function Get-Status([string]$path) {
  try { (Invoke-WebRequest "http://127.0.0.1:$port$path" -UseBasicParsing -TimeoutSec 5).StatusCode }
  catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
}
try {
  for ($i = 0; $i -lt 50 -and -not ((Test-Path $portLog) -and (Get-Content $portLog -Raw) -match 'listening'); $i++) { Start-Sleep -Milliseconds 200 }
  Check 'starts listening on 127.0.0.1' ((Test-Path $portLog) -and (Get-Content $portLog -Raw) -match 'listening')
  Check 'wrong key -> 403' ((Get-Status '/user?k=nope&u=abc') -eq 403)
  Check 'unknown path -> 403' ((Get-Status '/other?k=testkey') -eq 403)
  Check 'invalid username -> 400' ((Get-Status '/user?k=testkey&u=bad%20name') -eq 400)
  Check 'valid username -> 204' ((Get-Status '/user?k=testkey&u=octo-cat') -eq 204)
  Start-Sleep -Milliseconds 400
  Check 'the username reaches the shared state' ((Get-Content $userFile -Raw).Trim() -eq 'octo-cat')
  Check 'music button with nothing playing -> 404' ((Get-Status '/media?k=testkey&a=toggle') -eq 404)
  Check 'unknown music action -> 400' ((Get-Status '/media?k=testkey&a=format-disk') -eq 400)
} finally { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }


# ============================================================ 5. installer
Section '5. Installer (dry run)'
$out = Run-PS (Join-Path $root 'helper\install.ps1') @('-DryRun')
$found = ($out -join ' ') -match 'Would install from: (.+)$'
$notFound = ($out -join ' ') -match 'was not found in Lively'
Check 'finds the Lively copy, or explains how to add it' ($found -or $notFound) ($out -join ' ')
Write-Host "        $($out | Select-Object -First 1)"


# ============================================================ 6. browser
Section '6. Page in a headless browser'
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host '  SKIP  no Edge or Chrome found' -ForegroundColor Yellow }
else {
  # spaces as %20: the URL must stay one argument even when the folder name has spaces ("CS Board")
  $url = 'file:///' + (($root -replace '\\', '/') -replace ' ', '%20') + '/index.html?test&data=tests/fixtures/'
  $consoleLog = Join-Path $tmp 'browser.log'
  $p = Start-Process $browser -PassThru -WindowStyle Hidden -RedirectStandardError $consoleLog -ArgumentList @(
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',   # software WebGL: works without a GPU
    '--allow-file-access-from-files', '--enable-logging=stderr', '--v=0',
    "--user-data-dir=$(Join-Path $tmp 'profile')", '--window-size=1600,900', '--virtual-time-budget=30000', "--screenshot=$(Join-Path $tmp 'page.png')", $url)
  [void]$p.WaitForExit(120000)
  $lines = Get-Content $consoleLog | Where-Object { $_ -match 'CONSOLE.*"TEST' } | ForEach-Object { ($_ -split '"')[1] }
  foreach ($t in $lines) {
    if ($t -like 'TEST PASS *') { Check ($t.Substring(10)) $true }
    elseif ($t -like 'TEST FAIL *') { $n = $t.Substring(10); Check ($n -replace ':.*$') $false ($n -replace '^[^:]*:') }
  }
  $done = $lines | Where-Object { $_ -like 'TESTS DONE*' }
  Check 'browser tests finished' ([bool]$done) 'no "TESTS DONE" line (page crashed or timed out)'
}


# ============================================================ summary
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
$color = if ($script:fail) { 'Red' } else { 'Green' }
Write-Host "`n$($script:pass) passed, $($script:fail) failed" -ForegroundColor $color
exit $script:fail
