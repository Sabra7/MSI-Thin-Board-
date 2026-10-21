# Shared by every part of the helper (dot-sourced by cs-load.ps1 and by the worker threads).

# Appends one line to data\cs-load.log. Never throws: logging must not stop the helper.
function Write-Log([string]$Path, [string]$Source, [string]$Message) {
  try {
    "$(Get-Date -Format s) $Source$Message" | Add-Content -Path $Path -Encoding ASCII
  } catch {}
}

# Writes a file atomically: write a temp file, then swap it in, so the page never reads half a file.
# If the target is busy (the page is reading it right now), falls back to a plain write.
function Write-FileSafe([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8 without BOM
  $tmp = "$Path.tmp"
  [System.IO.File]::WriteAllText($tmp, $Text, $enc)
  try {
    if ([System.IO.File]::Exists($Path)) {
      [System.IO.File]::Replace($tmp, $Path, $null)
    } else {
      [System.IO.File]::Move($tmp, $Path)
    }
  } catch {
    [System.IO.File]::WriteAllText($Path, $Text, $enc)
    try { [System.IO.File]::Delete($tmp) } catch {}
  }
}

# GitHub usernames: letters, digits and single hyphens, not at the start or end, at most 39 characters.
$GithubNamePattern = '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$'
