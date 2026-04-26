# Bridger - Package Delivery Marketplace

Bridger is a mobile app connecting people who need to send packages with travelers heading to the same destination. Built with React Native (Expo), Express.js backend, and a Python AI face verification service.

## Architecture

```
app-bridger/
├── src/                    # React Native frontend (Expo SDK 54)
├── backend/                # Express.js + TypeScript API server
├── baileys-server/         # WhatsApp OTP service (Baileys)
├── face-verification-service/  # Python FastAPI + InsightFace AI
└── start-all.sh            # Start all services at once
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native 0.81, Expo SDK 54, TypeScript |
| State | Zustand + AsyncStorage |
| Navigation | React Navigation 7 |
| Backend API | Express.js + TypeScript, Prisma ORM |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Real-time | Socket.io |
| Auth | WhatsApp OTP via Baileys, JWT sessions |
| Face Verification | Python FastAPI, InsightFace (RetinaFace + ArcFace) |
| Payments | Stripe |
| Media | Cloudinary |

## Prerequisites

- **Node.js** >= 22.x
- **npm** >= 10.x
- **Python** >= 3.11 (for face verification)
- **Expo Go** app on your phone (iOS/Android)
- **Git**

### Windows-Specific Prerequisites

- Install [Node.js LTS](https://nodejs.org/) (includes npm)
- Install [Python 3.11+](https://www.python.org/downloads/) (check "Add to PATH" during install)
- Install [Git for Windows](https://git-scm.com/download/win)
- Use **PowerShell** or **Git Bash** as your terminal

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Jlidisalim/app-bridger.git
cd app-bridger
```

### 2. Install frontend dependencies

```bash
npm install --legacy-peer-deps
```

### 3. Setup Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` with your values:

```env
DATABASE_URL=file:./dev.db
JWT_SECRET=your-random-64-char-secret-here-change-this-in-production-please
JWT_REFRESH_SECRET=another-random-64-char-secret-change-this-too-in-production
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
CLOUDINARY_URL=cloudinary://key:secret@cloud
GOOGLE_MAPS_API_KEY=your-google-maps-key
PORT=3002
NODE_ENV=development
FACE_SERVICE_URL=http://localhost:8001
```

Generate the database:

```bash
npx prisma generate
npx prisma db push
```

### 4. Setup Baileys WhatsApp Server

```bash
cd ../baileys-server
npm install
```

### 5. Setup Face Verification Service

**macOS/Linux:**
```bash
cd ../face-verification-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
cd ..\face-verification-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Windows (Git Bash):**
```bash
cd ../face-verification-service
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
```

> Note: InsightFace model files (~300MB) will be downloaded automatically on first run.

## Running the App

### macOS/Linux (all at once)

```bash
cd /path/to/app-bridger
./start-all.sh
```

### Windows (PowerShell) - Run each in a separate terminal

**Terminal 1 - Backend:**
```powershell
cd backend
$env:PORT=3002
npx ts-node-dev --respawn --transpile-only src/server.ts
```
If `ts-node-dev` fails, use:
```powershell
node --require ts-node/register src/server.ts
```

**Terminal 2 - Baileys WhatsApp:**
```powershell
cd baileys-server
node server.js
```

**Terminal 3 - Face Verification:**
```powershell
cd face-verification-service
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

**Terminal 4 - Expo (Mobile App):**
```powershell
npx expo start --clear
```

### Connecting from your phone

1. Make sure your phone and computer are on the **same Wi-Fi network**
2. Install **Expo Go** from App Store / Play Store
3. Scan the QR code shown in the Expo terminal
4. The app will load on your phone

### API Configuration for Physical Devices

When running on a physical phone (not emulator), update the API URL in `src/services/api/client.ts`:

```typescript
const DEV_API_URL = Platform.select({
  android: 'http://YOUR_PC_IP:3002',
  ios: 'http://YOUR_PC_IP:3002',
  default: 'http://localhost:3002',
});
```

Replace `YOUR_PC_IP` with your computer's local IP:
- **Windows:** Run `ipconfig` and use the IPv4 address
- **macOS:** Run `ipconfig getifaddr en0`

Do the same in `src/hooks/useSocket.ts` and `src/services/api/faceVerification.ts`.

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Expo Dev Server | 8081 | Metro bundler + dev server |
| Backend API | 3002 | Express.js REST API + Socket.io |
| Baileys Server | 3000 | WhatsApp OTP authentication |
| Face Verification | 8001 | Python AI face matching service |

## Features

- Phone number authentication via WhatsApp OTP
- Package delivery deal creation and matching
- Real-time chat between senders and travelers
- Face verification (selfie vs ID document) using AI
- QR code verification for package pickup/delivery
- Stripe payment integration
- Push notifications
- Trip management for travelers
- Rating and review system

## Troubleshooting

### "Network request failed" on phone
- Ensure phone and PC are on the same Wi-Fi
- Update API URLs with your PC's local IP (see above)
- Disable VPN/Private Relay on iPhone

### Backend won't start
- Check `backend/.env` exists with all required values
- Run `npx prisma generate` in the backend folder
- Ensure port 3002 is not in use: `lsof -i :3002` (mac) or `netstat -ano | findstr :3002` (windows)

### Face verification service won't start
- Ensure Python venv is activated
- Run `pip install -r requirements.txt` again
- First startup is slow (~30-60s) as it downloads AI models

### Expo crashes or hangs
- Clear cache: `npx expo start --clear`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install --legacy-peer-deps`
- Kill stuck processes on port 8081
# app-bridger
