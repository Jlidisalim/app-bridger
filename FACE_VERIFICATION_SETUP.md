# Bridger Face Verification System

## Architecture

```
┌─────────────────────┐     ┌────────────────────┐     ┌─────────────────────────┐
│  React Native App   │────▶│  Node.js Backend   │────▶│  Python AI Service      │
│  (Expo Camera)      │     │  (Express + Multer)│     │  (FastAPI + InsightFace) │
│                     │     │  Port 3002         │     │  Port 8001              │
└─────────────────────┘     └────────────────────┘     └─────────────────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  SQLite/PG   │
                              │  (Prisma)    │
                              └──────────────┘
```

## Folder Structure

```
app-bridger/
├── src/                              # React Native frontend
│   ├── screens/
│   │   ├── FaceVerificationScreen.tsx    # Selfie capture with liveness detection
│   │   ├── IDDocumentScanScreen.tsx      # ID document upload & face extraction
│   │   └── VerificationResultScreen.tsx  # Comparison results display
│   ├── services/api/
│   │   └── faceVerification.ts           # API client for verification endpoints
│   └── store/
│       └── useAppStore.ts                # Zustand store (face verification state)
│
├── backend/                          # Node.js API
│   ├── src/
│   │   ├── routes/verification.ts        # POST /verify/* endpoints
│   │   ├── services/faceVerificationService.ts  # Proxy to Python service
│   │   └── server.ts                     # Express app (verification routes registered)
│   └── prisma/schema.prisma              # DB schema with face verification fields
│
└── face-verification-service/        # Python AI microservice
    ├── app/
    │   ├── main.py                       # FastAPI endpoints
    │   ├── face_engine.py                # InsightFace (RetinaFace + ArcFace)
    │   ├── quality_checks.py             # Blur, brightness, face size validation
    │   ├── liveness.py                   # Anti-spoofing (texture, color, reflection)
    │   ├── document.py                   # ID document face extraction
    │   ├── schemas.py                    # Pydantic models
    │   └── config.py                     # Configuration & thresholds
    ├── requirements.txt
    └── Dockerfile
```

## Installation

### 1. Python AI Service

```bash
cd face-verification-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# The InsightFace buffalo_l model will be auto-downloaded on first run (~300MB)
# Models are cached in ~/.insightface/models/

# Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**GPU Support (optional):**
```bash
# Replace onnxruntime with GPU version
pip uninstall onnxruntime
pip install onnxruntime-gpu
```

### 2. Node.js Backend

```bash
cd backend

# Install new dependency
npm install form-data

# Run database migration
npx prisma migrate dev --name add-face-verification

# Generate Prisma client
npx prisma generate

# Start the server
npm run dev
```

### 3. React Native App

```bash
# From project root
npm install

# iOS
cd ios && pod install && cd ..
npx expo run:ios

# Android
npx expo run:android
```

## Environment Variables

Add to `backend/.env`:
```
FACE_SERVICE_URL=http://localhost:8001
```

## API Endpoints

### POST /verify/capture-face
Upload a selfie for processing.

**Request:** `multipart/form-data` with `image` field

**Response:**
```json
{
  "success": true,
  "message": "Face captured successfully",
  "embedding": [0.023, -0.145, ...],  // 512-d vector
  "quality": {
    "passed": true,
    "blur_score": 245.3,
    "brightness": 128.5,
    "face_size": 180,
    "face_count": 1,
    "issues": []
  },
  "liveness": {
    "is_live": true,
    "score": 0.78,
    "checks": {
      "texture": 0.85,
      "color": 0.72,
      "edges": 0.68,
      "reflection": 0.95
    }
  }
}
```

### POST /verify/upload-id
Upload an ID document for face extraction.

**Request:** `multipart/form-data` with `image` field

**Response:**
```json
{
  "success": true,
  "message": "Face extracted from document successfully",
  "embedding": [0.012, -0.098, ...],  // 512-d vector
  "face_confidence": 0.982,
  "document_face_bbox": [120, 85, 280, 310]
}
```

### POST /verify/compare
Compare two face embeddings.

**Request:**
```json
{
  "face_embedding": [0.023, -0.145, ...],
  "id_embedding": [0.012, -0.098, ...]
}
```

**Response:**
```json
{
  "verified": true,
  "confidence": 0.82,
  "message": "Face matches ID document"
}
```

## AI Models Used

| Component | Model | Purpose |
|-----------|-------|---------|
| Face Detection | RetinaFace (via InsightFace) | Detect faces with bounding boxes |
| Face Embedding | ArcFace (via InsightFace) | Generate 512-d face vectors |
| Face Comparison | Cosine Similarity | Compare embedding vectors |
| Liveness | Custom (LBP + Color + Edge + Reflection) | Anti-spoofing checks |

## Security Checks

- **Blur detection**: Laplacian variance threshold (rejects blurry images)
- **Brightness check**: Rejects too dark or overexposed images
- **Face size validation**: Minimum 80px face dimension
- **Single face enforcement**: Rejects frames with 0 or 2+ faces
- **Liveness detection**: Texture analysis, color distribution, edge density, reflection check
- **Photo attack prevention**: LBP variance detects printed photos
- **Screen attack prevention**: Reflection analysis detects screen displays

## Database Schema

```sql
-- Added to User table
faceEmbedding          TEXT     -- JSON array of 512 floats
faceVerificationStatus TEXT     -- PENDING | VERIFIED | FAILED
faceVerifiedAt         DATETIME
faceConfidenceScore    REAL
```

## Test with cURL

```bash
# 1. Capture face
curl -X POST http://localhost:8001/verify/capture-face \
  -F "image=@selfie.jpg"

# 2. Upload ID
curl -X POST http://localhost:8001/verify/upload-id \
  -F "image=@passport.jpg"

# 3. Compare (use embeddings from steps 1 & 2)
curl -X POST http://localhost:8001/verify/compare \
  -H "Content-Type: application/json" \
  -d '{
    "face_embedding": [0.023, -0.145, ...],
    "id_embedding": [0.012, -0.098, ...]
  }'
```

## Docker (Python Service)

```bash
cd face-verification-service
docker build -t bridger-face-service .
docker run -p 8001:8001 bridger-face-service
```

## Performance Notes

- First request is slower (~5s) as the model loads into memory
- Subsequent requests: ~200-500ms on CPU, ~50-100ms on GPU
- Model memory: ~500MB RAM
- Supports concurrent requests (FastAPI async)
- Embeddings are only 512 floats (2KB) — minimal storage overhead
