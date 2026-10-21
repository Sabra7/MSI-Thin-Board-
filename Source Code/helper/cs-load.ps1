<#
  MSI Thin Board helper - keeps the wallpaper fed with real data. Runs hidden in the background (started at Windows login by
  the shortcut install.bat creates). Must live in helper\ of the wallpaper's folder inside Lively's library.

  What it writes to data\ (the page re-reads these files):
    load.js    every ~1.5 s     CPU %, GPU %, battery, RAM, disk, network speed, hardware names, the port key
    track.js   when it changes  the song playing in Windows (title, artist, play state, cover id)
    cover.js   once per song    its cover image
    repos.js   every ~20 min    your GitHub repos for the Repos scene            (repos-worker.ps1, own thread)
    cs-load.log                 errors and start-up notes
  and it listens on 127.0.0.1:47831 for the music buttons and the GitHub setting  (port-listener.ps1, own thread)

  Why it exists: Lively's own CPU/GPU numbers are 0 on some PCs (broken Windows performance counters), and Lively cannot
  control the music session or see your local repos.
  Light on purpose: one small compiled reader (CsSys.cs) instead of PowerShell commands, no process spawned per tick, and
  the memory is trimmed regularly.

  Optional helper\cs-links.json:  { "githubUser": "", "extraScanRoots": [] }
  (githubUser is only used when the "GitHub username" Lively setting is empty)
#>

# ============================ SETTINGS ============================
$TickMs          = 1500    # how often load.js is rewritten (the page reads it every 2 s)
$TrackEveryTicks = 2       # now-playing check every N ticks (2 = every ~3 s)
$TrimEveryTicks  = 40      # give unused memory back to Windows every N ticks (~1 min)
$ReposEveryMin   = 20      # re-scan your repos every N minutes
$GithubEveryMin  = 60      # ask the public GitHub API at most once per N minutes (no token used)
$ScanDepth       = 4       # how deep to look for git repos under your user folder
$Port            = 47831   # local port (must match HELPER_PORT in js/config.js)
# ==================================================================

$helperDir = $PSScriptRoot
$root = Split-Path -Parent $helperDir                 # the wallpaper folder
$dataDir = Join-Path $root 'data'
[void][System.IO.Directory]::CreateDirectory($dataDir)
$log = Join-Path $dataDir 'cs-load.log'
. (Join-Path $helperDir 'common.ps1')
function Log([string]$m) { Write-Log $log '' $m }

# Only one copy at a time (a second start, e.g. by hand, exits at once). $mutex must stay referenced while running.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\CSBoardLoadHelper', [ref]$created)
if (-not $created) { exit }
Log 'started'

# Shared with the worker threads (synchronized):
#   key  = random key for the local port; the page receives it inside load.js, other programs cannot guess it
#   user = GitHub username from the wallpaper's Lively setting (the page sends it through the port)
$shared = [hashtable]::Synchronized(@{ key = [guid]::NewGuid().ToString('N'); user = '' })


# ============================ 1. SYSTEM READER (CsSys.cs, compiled once to CsSys.dll) ============================
# Compiled on this PC with the C# compiler that ships with Windows (.NET Framework 4), in a separate process so the
# helper stays small. Rebuilt automatically when CsSys.cs is newer than the dll. Fallback: compile in-process.
$srcFile = Join-Path $helperDir 'CsSys.cs'
$dllFile = Join-Path $helperDir 'CsSys.dll'
$csc = @('Framework64', 'Framework') |
  ForEach-Object { Join-Path $env:WINDIR "Microsoft.NET\$_\v4.0.30319\csc.exe" } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
$stale = -not (Test-Path $dllFile) -or (Get-Item $dllFile).LastWriteTime -lt (Get-Item $srcFile).LastWriteTime
if ($csc -and $stale) { & $csc /nologo /target:library /optimize+ "/out:$dllFile" $srcFile | Out-Null }
if (Test-Path $dllFile) { [void][Reflection.Assembly]::LoadFrom($dllFile) } else { Add-Type -Path $srcFile }
[CsSys]::Init()

# GPU: NVML (NVIDIA) or Windows' GPU counters (any vendor). Only when both are missing, ask nvidia-smi every other tick.
$nvsmi = $null
if ([CsSys]::GpuSource -eq 'none') { $nvsmi = (Get-Command nvidia-smi -ErrorAction SilentlyContinue).Source }
Log "GPU readings: $([CsSys]::GpuSource)$(if ($nvsmi) { ' + nvidia-smi' })"


# ============================ 2. HARDWARE NAMES (once, for the board's chip labels) ============================
function Get-HardwareNames {
  $hw = [ordered]@{ cpu = ''; gpu = ''; vram = 0; ram = '' }

  # CPU: "12th Gen Intel(R) Core(TM) i7-12650H"
  try { $hw.cpu = ([string](Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0').ProcessorNameString).Trim() } catch {}

  # GPU: the display adapter with the most dedicated memory (skips virtual / remote-desktop adapters)
  try {
    $displayClass = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    $best = Get-ChildItem $displayClass -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -match '^\d{4}$' } |
      ForEach-Object {
        $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        if ($p.DriverDesc -and $p.DriverDesc -notmatch 'Basic|Virtual|Remote|Parsec|Mirror') {
          $mem = $p.'HardwareInformation.qwMemorySize'
          if ($mem -is [byte[]]) { $mem = [BitConverter]::ToInt64($mem, 0) }
          [pscustomobject]@{ name = [string]$p.DriverDesc; mem = [int64]$mem }
        }
      } |
      Sort-Object mem -Descending | Select-Object -First 1
    if ($best) { $hw.gpu = $best.name; $hw.vram = [math]::Round($best.mem / 1GB) }
  } catch {}

  # RAM: memory type and form factor of the first stick (SMBIOS codes), e.g. "DDR4 SODIMM"
  try {
    $stick = Get-CimInstance Win32_PhysicalMemory -ErrorAction Stop | Select-Object -First 1
    $type = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 30 = 'LPDDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }[[int]$stick.SMBIOSMemoryType]
    $form = @{ 8 = 'DIMM'; 12 = 'SODIMM' }[[int]$stick.FormFactor]
    $hw.ram = (@($type, $form) | Where-Object { $_ }) -join ' '
  } catch {}
  $hw
}
[CsSys]::Extra = ',hw:' + (Get-HardwareNames | ConvertTo-Json -Compress)   # appended to every load.js line


# ============================ 3. WINDOWS MEDIA SESSION (now playing + music buttons) ============================
# WinRT types used through PowerShell. Set up once here; the port thread gets $asTask and the manager type.
$asTask = $null; $tMgr = $null; $trackOk = $false
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  # AsTask(IAsyncOperation<T>) turns a WinRT async call into a .NET Task we can wait on
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  $tMgr    = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $tProps  = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
  $tStream = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $tIn     = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asRead  = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@($tIn))
  $trackOk = $true
} catch { Log "media session unavailable: $($_.Exception.Message)" }

# Waits (at most 4 s) for a WinRT async operation and returns its result.
function Await($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$task.Wait(4000)
  $task.Result
}


# ============================ 4. WORKER THREADS ============================
# Each runs a .ps1 file in its own runspace (a separate PowerShell thread inside this process).
function Start-Worker([string]$file, [object[]]$arguments) {
  $rs = [runspacefactory]::CreateRunspace(); $rs.Open()
  $ps = [powershell]::Create(); $ps.Runspace = $rs
  [void]$ps.AddScript([System.IO.File]::ReadAllText((Join-Path $helperDir $file)))
  foreach ($a in $arguments) { [void]$ps.AddArgument($a) }
  [void]$ps.BeginInvoke()
}
Start-Worker 'repos-worker.ps1' @($root, $log, ($ReposEveryMin * 60), $GithubEveryMin, $ScanDepth, $shared, 0)
Start-Worker 'port-listener.ps1' @($root, $log, $Port, $shared, $asTask, $tMgr)


# ============================ 5. NOW PLAYING (track.js + cover.js) ============================
# track.js is small and rewritten only when something changes; the cover goes to cover.js once per song, so the page
# does not re-read a big image every few seconds. cv = cover id: the page loads cover.js when it sees a new one.
$trackOut = Join-Path $dataDir 'track.js'
$coverOut = Join-Path $dataDir 'cover.js'
$trackMgr = $null      # session manager (created on first use)
$trackKey = $null      # app|title|artist of the current song
$trackImg = ''         # its cover as a data: URL
$trackWritten = $null  # what track.js currently says
$coverId = 0

# The song's cover as a data: URL ('' when there is none or it is too big).
function Get-CoverDataUrl($props) {
  if (-not $props.Thumbnail) { return '' }
  $stream = Await ($props.Thumbnail.OpenReadAsync()) $tStream
  $mem = New-Object IO.MemoryStream
  $reader = $asRead.Invoke($null, @($stream))
  try { $reader.CopyTo($mem); $bytes = $mem.ToArray() }
  finally { $reader.Dispose(); $mem.Dispose(); $stream.Dispose() }
  if ($bytes.Length -eq 0 -or $bytes.Length -ge 800000) { return '' }
  $mime = switch ($bytes[0]) { 0xFF { 'image/jpeg' } 0x42 { 'image/bmp' } default { 'image/png' } }   # file signature
  "data:$mime;base64," + [Convert]::ToBase64String($bytes)
}

function Update-Track {
  if (-not $script:trackMgr) { $script:trackMgr = Await ($tMgr::RequestAsync()) $tMgr }
  $session = $script:trackMgr.GetCurrentSession()
  $o = [ordered]@{ t = ''; a = ''; p = 0; cv = 0 }   # title, artist, playing, cover id
  $stamp = 'none'
  if ($session) {
    $props = Await ($session.TryGetMediaPropertiesAsync()) $tProps
    $o.t = [string]$props.Title
    $o.a = [string]$props.Artist
    $o.p = if ([string]$session.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { 1 } else { 0 }
    $key = "$($session.SourceAppUserModelId)|$($o.t)|$($o.a)"
    if ($key -ne $script:trackKey -or ($o.t -and -not $script:trackImg)) {   # new song (or no cover yet): fetch the cover
      $script:trackKey = $key
      $img = ''
      try { $img = Get-CoverDataUrl $props } catch {}
      if ($img -ne $script:trackImg) {
        $script:trackImg = $img
        if ($img) {
          $script:coverId++
          Write-FileSafe $coverOut ('window.__csCover && window.__csCover(' + $script:coverId + ',"' + $img + '");')
        }
      }
    }
    if ($script:trackImg) { $o.cv = $script:coverId }
    $stamp = "$key|$($o.p)|$($o.cv)"
  } else {
    $script:trackKey = $null; $script:trackImg = ''
  }
  if ($stamp -ne $script:trackWritten) {
    $script:trackWritten = $stamp
    Write-FileSafe $trackOut ('window.__csTrack && window.__csTrack(' + ($o | ConvertTo-Json -Compress) + ');')
  }
}


# ============================ 6. MAIN LOOP ============================
$loadOut = Join-Path $dataDir 'load.js'
$tick = 0
$gpuSmi = -1       # last nvidia-smi reading (fallback only)
$lastErr = ''      # each kind of error is logged once until it recovers
[CsSys]::Trim()
while ($true) {
  try {
    if ($nvsmi -and $tick % 2 -eq 0) {
      try {
        $v = & $nvsmi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
        if ($v -match '^\s*\d+') { $gpuSmi = [int]$v }
      } catch {}
    }
    Write-FileSafe $loadOut ([CsSys]::Line($shared.key, $gpuSmi))
    if ($lastErr -eq 'load') { $lastErr = '' }
  } catch {
    if ($lastErr -ne 'load') { Log "load.js failed: $($_.Exception.Message)"; $lastErr = 'load' }
  }

  if ($trackOk -and $tick % $TrackEveryTicks -eq 0) {
    try {
      Update-Track
      if ($lastErr -eq 'track') { $lastErr = '' }
    } catch {
      if ($lastErr -ne 'track') { Log "now-playing failed: $($_.Exception.Message)"; $lastErr = 'track' }
    }
  }

  if ($tick % $TrimEveryTicks -eq 0) { [CsSys]::Trim() }
  $tick++
  Start-Sleep -Milliseconds $TickMs
}
