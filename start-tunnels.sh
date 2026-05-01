#!/bin/bash
# Start Cloudflare tunnels and auto-update app URLs

echo "Starting Cloudflare tunnels..."

cloudflared tunnel --url http://127.0.0.1:3000 > /tmp/cf-baileys.log 2>&1 &
cloudflared tunnel --url http://127.0.0.1:4000 > /tmp/cf-backend.log 2>&1 &

echo "Waiting for tunnels..."
sleep 10

BAILEYS_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf-baileys.log | tail -1)
BACKEND_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf-backend.log | tail -1)

echo "Baileys: $BAILEYS_URL"
echo "Backend: $BACKEND_URL"

# Patch the app source files
sed -i "s|const DEV_BAILEYS_URL = '.*'|const DEV_BAILEYS_URL = '$BAILEYS_URL'|" src/services/whatsapp/otpService.ts
sed -i "s|? 'https://.*trycloudflare\.com'|? '$BACKEND_URL'|g" src/services/api/client.ts
sed -i "s|? 'https://.*trycloudflare\.com'|? '$BACKEND_URL'|g" src/services/api/faceVerification.ts

echo "App URLs updated. Restart Expo to apply changes."
