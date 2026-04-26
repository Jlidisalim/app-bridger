$cloudflared = "C:\Users\salim\AppData\Roaming\npm\node_modules\cloudflared\bin\cloudflared.exe"

Write-Host "Killing old tunnels..." -ForegroundColor Yellow
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

$baileysLog = "$env:TEMP\cf-baileys.log"
$backendLog  = "$env:TEMP\cf-backend.log"

function Start-Tunnel {
    param($name, $port, $logFile)
    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Remove-Item $logFile -ErrorAction SilentlyContinue
        Write-Host "Starting $name tunnel (port $port) - attempt $attempt/$maxAttempts..." -ForegroundColor Yellow

        Start-Process -FilePath $cloudflared `
            -ArgumentList "tunnel --url http://127.0.0.1:$port" `
            -RedirectStandardError $logFile -NoNewWindow

        $waited = 0
        $url = $null
        while ($waited -lt 20) {
            Start-Sleep 2
            $waited += 2
            $url = Get-Content $logFile -ErrorAction SilentlyContinue |
                   Select-String 'https://[a-z0-9\-]+\.trycloudflare\.com' |
                   ForEach-Object { $_.Matches[0].Value } |
                   Select-Object -Last 1
            if ($url) { break }
        }

        if ($url) {
            Write-Host "$name : $url" -ForegroundColor Green
            return $url
        }

        Write-Host "$name tunnel attempt $attempt failed. Retrying..." -ForegroundColor DarkYellow
        Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep 3
    }

    Write-Host "ERROR: $name tunnel failed after $maxAttempts attempts. Log: $logFile" -ForegroundColor Red
    Get-Content $logFile -ErrorAction SilentlyContinue | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    return $null
}

# Check local servers are actually listening before tunneling
function Test-Port($port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', $port)
        $tcp.Close()
        return $true
    } catch { return $false }
}

Write-Host "Checking local servers..." -ForegroundColor Cyan
if (-not (Test-Port 3000)) {
    Write-Host "ERROR: Nothing is listening on port 3000 (Baileys server not running)." -ForegroundColor Red
    Write-Host "  Start it first:  cd baileys-server && node server.js" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Port 4000)) {
    Write-Host "ERROR: Nothing is listening on port 4000 (Backend server not running)." -ForegroundColor Red
    Write-Host "  Start it first:  cd backend && npm run dev" -ForegroundColor Yellow
    exit 1
}
Write-Host "Both servers are up." -ForegroundColor Green

$baileysUrl = Start-Tunnel "Baileys" 3000 $baileysLog
$backendUrl  = Start-Tunnel "Backend" 4000 $backendLog

if (-not $baileysUrl -or -not $backendUrl) {
    Write-Host "One or more tunnels failed." -ForegroundColor Red
    exit 1
}

$otpFile    = "src\services\whatsapp\otpService.ts"
$clientFile = "src\services\api\client.ts"
$faceFile   = "src\services\api\faceVerification.ts"

$baileysSafe = [regex]::Escape($baileysUrl)
$backendSafe = [regex]::Escape($backendUrl)

(Get-Content $otpFile)    -replace 'const DEV_BAILEYS_URL = .https://\S+.;', "const DEV_BAILEYS_URL = '$baileysUrl';" | Set-Content $otpFile
(Get-Content $clientFile) -replace 'https://[a-z0-9\-]+\.trycloudflare\.com', $backendUrl | Set-Content $clientFile
(Get-Content $faceFile)   -replace 'https://[a-z0-9\-]+\.trycloudflare\.com', $backendUrl | Set-Content $faceFile

Write-Host ""
Write-Host "URLs patched. Now do ONE of:" -ForegroundColor Cyan
Write-Host "  1. In the Metro terminal: press r  (full JS bundle reload)" -ForegroundColor White
Write-Host "  2. On the iPhone: shake device -> Reload" -ForegroundColor White
Write-Host "  3. Close Expo Go fully, reopen and scan QR" -ForegroundColor White
Write-Host ""
Write-Host "Backend health: $backendUrl/health" -ForegroundColor DarkGray
Write-Host "If iPhone gets 'Network request failed' -> open the health URL in iPhone Safari first." -ForegroundColor DarkGray
