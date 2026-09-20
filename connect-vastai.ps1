# One-click local launcher for the vast.ai-backed dev harness.
# NOT part of the shipped game - this only drives local tooling (an SSH
# tunnel + the dev http server) on your machine.
#
# What it does: opens the SSH tunnel local-ai-shim.js needs (18188 -> ComfyUI,
# 3000 -> llama-server, both loopback-only on the remote box; see
# src/src/dev/LOCAL-AI-SETUP.md for why a tunnel instead of the public
# ip:port), starts the local http server if it isn't already running, and
# opens dev-harness.html in your browser.
#
# Usage:
#   .\connect-vastai.ps1 -SshHost 129.153.115.129 -SshPort 40121
# Re-run with no arguments later in the same session and it reuses whatever
# host/port you gave it last (saved to .vast-ai-last-connection.json,
# gitignored - it's just connection info, not a secret).
#
# The instance itself still needs vast-ai-startup.sh to have run at least
# once (paste it as the instance's on-start script and it self-configures
# on every future boot - see that file's own header).

param(
  [string]$SshHost,
  [int]$SshPort,
  [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_vastai",
  [string]$SshUser = "root"
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$stateFile = Join-Path $repoRoot ".vast-ai-last-connection.json"

if (-not $SshHost -or -not $SshPort) {
  if (Test-Path $stateFile) {
    $last = Get-Content $stateFile | ConvertFrom-Json
    if (-not $SshHost) { $SshHost = $last.SshHost }
    if (-not $SshPort) { $SshPort = $last.SshPort }
    Write-Host "Reusing last connection: $SshUser@$SshHost`:$SshPort"
  }
}
if (-not $SshHost -or -not $SshPort) {
  Write-Error "No saved connection yet. Run with -SshHost and -SshPort once (from vast.ai's connect dialog)."
  exit 1
}
@{ SshHost = $SshHost; SshPort = $SshPort } | ConvertTo-Json | Set-Content $stateFile

if (-not (Test-Path $KeyPath)) {
  Write-Error "Private key not found at $KeyPath. Pass -KeyPath if it's somewhere else."
  exit 1
}

function Test-PortOpen($port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $ok = $c.ConnectAsync("127.0.0.1", $port).Wait(300)
    $c.Close()
    return $ok
  } catch { return $false }
}

# --- SSH tunnel (18188 = ComfyUI, 3000 = llama-server, both loopback-only remotely) ---
# Self-healing: vast.ai's SSH endpoint has been observed closing an idle-ish
# connection unprompted ("Connection to X closed by remote host", no local
# network issue) even with keepalives on - confirmed twice in one session.
# So this isn't one ssh process, it's a tiny watchdog loop that reconnects
# whenever ssh exits, for any reason, after a short pause.
if (Test-PortOpen 18188) {
  Write-Host "Tunnel already up (18188 responding) - leaving it as-is."
} else {
  Write-Host "Opening SSH tunnel (self-healing) to $SshUser@$SshHost`:$SshPort ..."
  $sshCmd = "while (`$true) { ssh -i '$KeyPath' -p $SshPort -N " +
    "-L 18188:127.0.0.1:18188 -L 3000:127.0.0.1:3000 " +
    "-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=3 " +
    "-o ExitOnForwardFailure=yes $SshUser@$SshHost; Start-Sleep -Seconds 3 }"
  Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-Command", $sshCmd) -WindowStyle Hidden
  $waited = 0
  while (-not (Test-PortOpen 18188) -and $waited -lt 15) { Start-Sleep -Seconds 1; $waited++ }
  if (-not (Test-PortOpen 18188)) {
    Write-Warning "Tunnel didn't come up in 15s (bad host/port, or the instance is stopped) - it will keep retrying every 3s in the background regardless."
  }
}

# --- Local dev http server (python -m http.server 8734) ---
if (Test-PortOpen 8734) {
  Write-Host "Dev server already running on :8734."
} else {
  Write-Host "Starting python -m http.server 8734 ..."
  Start-Process -FilePath "python" -ArgumentList @("-m", "http.server", "8734") `
    -WorkingDirectory $repoRoot -WindowStyle Minimized
  Start-Sleep -Seconds 1
}

if (-not (Test-Path (Join-Path $repoRoot "local-ai.config.js"))) {
  Write-Warning "local-ai.config.js doesn't exist yet - copy local-ai.config.example.js to create it (one-time, per checkpoint choice)."
}

Start-Process "http://localhost:8734/dev-harness.html?cb=$(Get-Date -UFormat %s)"
Write-Host "Done. Two minimized windows are holding the tunnel and the dev server open - close them (or this won't survive a reboot) when you're done for the session."
