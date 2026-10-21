<#
  MSI Thin Board helper - LOCAL PORT (music buttons + GitHub username setting)

  Runs in its own background thread, started by cs-load.ps1. An HTTP listener on 127.0.0.1 only (never reachable from
  the network). Every request must carry the random key that cs-load.ps1 creates at start-up and hands to the page
  inside data\load.js; anything else gets 403. It understands exactly two requests:

    GET /media?k=<key>&a=prev|next|toggle    previous / play-pause / next for the current Windows media session
    GET /user?k=<key>&u=<name>               the GitHub username typed in the wallpaper's Lively settings

  It cannot open programs, files or links. Answers: 204 done, 400 bad value, 403 wrong key/path, 404 nothing playing.
#>
param(
  [string]$Root,          # the wallpaper folder
  [string]$Log,
  [int]$Port,
  [hashtable]$Shared,     # .key = the random key, .user = GitHub username (read by the repos worker)
  $AsTask,                # WinRT helpers from cs-load.ps1 ($null when the media session is unavailable)
  $ManagerType
)

. (Join-Path $Root 'helper\common.ps1')
function L([string]$m) { Write-Log $Log 'port: ' $m }

# the Windows media session manager (same source as the media-keys overlay)
$mgr = $null
if ($AsTask) {
  try {
    $task = $AsTask.MakeGenericMethod($ManagerType).Invoke($null, @($ManagerType::RequestAsync()))
    [void]$task.Wait(5000); $mgr = $task.Result
  } catch { L "no media session: $($_.Exception.Message)" }
}

try {
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$Port/")
  $listener.Start()
  L 'listening'
} catch { L "start failed (port $Port in use?): $($_.Exception.Message)"; return }

while ($listener.IsListening) {
  $ctx = $null
  try {
    $ctx = $listener.GetContext()           # waits for the next request
    $q = $ctx.Request.QueryString
    $path = $ctx.Request.Url.AbsolutePath
    $status = 204

    if ($q['k'] -ne $Shared.key -or $path -notin '/media', '/user') {
      $status = 403
    }
    elseif ($path -eq '/user') {
      $u = [string]$q['u']
      if ($u -eq '' -or $u -match $GithubNamePattern) { $Shared.user = $u } else { $status = 400 }
    }
    else {   # /media
      $session = if ($mgr) { $mgr.GetCurrentSession() } else { $null }
      $op = $null
      switch ($q['a']) {
        'prev'   { if ($session) { $op = $session.TrySkipPreviousAsync() } }
        'next'   { if ($session) { $op = $session.TrySkipNextAsync() } }
        'toggle' { if ($session) { $op = $session.TryTogglePlayPauseAsync() } }
        default  { $status = 400 }
      }
      if ($status -eq 204 -and -not $session) { $status = 404 }
      if ($op) { $task = $AsTask.MakeGenericMethod([bool]).Invoke($null, @($op)); [void]$task.Wait(4000) }
    }
    $ctx.Response.StatusCode = $status
  } catch { L "request failed: $($_.Exception.Message)" }
  finally {
    if ($ctx) { try { $ctx.Response.Close() } catch {} }
  }
}
