<#
  MSI Thin Board - sets up the helper (helper\cs-load.ps1) that feeds the wallpaper real CPU / GPU / battery / music / repo data.
  Started by install.bat / uninstall.bat. Run it AFTER adding the wallpaper to Lively; it can be run from anywhere:
    1. finds the copy of the wallpaper inside Lively's library (Lively copies a wallpaper there when you add it)
    2. makes the helper start at Windows login from that copy (Startup-folder shortcut, no admin needed)
    3. starts it right now (stopping an older running copy first)
  Re-running is safe.
    -Uninstall   stop the helper and remove the startup shortcut
    -DryRun      only print which copy would be used (changes nothing; used by tests\run-tests.ps1)
#>
param([switch]$Uninstall, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'CS Board Load.lnk'

function Stop-Helper {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'cs-load\.ps1' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# Folders where Lively may keep its wallpapers: installer version, Microsoft Store version, and a custom library folder
# from Lively's Settings.json (the Store version silently redirects AppData paths into its own package folder).
function Get-LivelyLibraries {
  $la = $env:LOCALAPPDATA
  $libs = New-Object System.Collections.Generic.List[string]
  $libs.Add((Join-Path $la 'Lively Wallpaper\Library'))
  $homes = @(@{ dir = (Join-Path $la 'Lively Wallpaper'); pkg = $null })
  foreach ($p in @(Get-ChildItem (Join-Path $la 'Packages') -Directory -Filter '*rocksdanister.LivelyWallpaper_*' -ErrorAction SilentlyContinue)) {
    $libs.Add((Join-Path $p.FullName 'LocalCache\Local\Lively Wallpaper\Library'))
    $homes += @{ dir = (Join-Path $p.FullName 'LocalCache\Local\Lively Wallpaper'); pkg = $p.FullName }
  }
  foreach ($h in $homes) {
    try {
      $custom = (Get-Content (Join-Path $h.dir 'Settings.json') -Raw | ConvertFrom-Json).WallpaperDir
      if (-not $custom) { continue }
      $libs.Add($custom)
      if ($h.pkg -and $custom.StartsWith($la, [StringComparison]::OrdinalIgnoreCase)) {
        $libs.Add((Join-Path $h.pkg ('LocalCache\Local' + $custom.Substring($la.Length))))
      }
    } catch {}
  }
  $libs | Select-Object -Unique
}

# The MSI Thin Board copies inside those libraries, newest first (it may have been added more than once).
function Find-WallpaperCopies {
  @(foreach ($lib in Get-LivelyLibraries) {
    $wallpapers = Join-Path $lib 'wallpapers'
    if (-not (Test-Path $wallpapers)) { continue }
    Get-ChildItem $wallpapers -Directory -ErrorAction SilentlyContinue | Where-Object {
      (Test-Path (Join-Path $_.FullName 'helper\cs-load.ps1')) -and (Test-Path (Join-Path $_.FullName 'js\scenes\board.js'))
    }
  }) | Sort-Object CreationTime -Descending
}


if ($Uninstall) {
  Stop-Helper
  if (Test-Path $shortcut) { Remove-Item $shortcut -Force }
  Write-Host 'MSI Thin Board helper stopped and removed from startup. Remove the wallpaper itself in Lively.'
  exit 0
}

$copies = @(Find-WallpaperCopies)
if (-not $copies.Count) {
  Write-Host 'MSI Thin Board was not found in Lively''s library.' -ForegroundColor Yellow
  Write-Host 'Add the wallpaper to Lively first (drag this folder or the .zip onto Lively''s window), then run install.bat again.'
  exit 1
}
$target = $copies[0].FullName
$script = Join-Path $target 'helper\cs-load.ps1'
if ($DryRun) { Write-Host "Would install from: $target"; exit 0 }

# Downloaded files carry a "from the internet" mark; clear it so the helper can build and load its system reader.
Get-ChildItem $target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

Stop-Helper
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$s.TargetPath = 'powershell.exe'
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$s.WorkingDirectory = $target
$s.WindowStyle = 7                        # minimized (the -WindowStyle Hidden argument hides it completely)
$s.IconLocation = 'shell32.dll,21'
$s.Description = 'MSI Thin Board wallpaper helper'
$s.Save()
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`""

Write-Host "Done. The helper runs from: $target"
Write-Host "Startup shortcut: $shortcut"
Write-Host 'Tip: type your GitHub username in the wallpaper''s settings in Lively to see your repos.'
