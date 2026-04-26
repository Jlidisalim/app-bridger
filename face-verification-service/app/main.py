"""
Bridger Face Verification Microservice
FastAPI application with InsightFace-powered face verification.
"""

import logging
import io
import os
import time
from collections import defaultdict
import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .face_engine import FaceEngine
from .quality_checks import validate_image_quality
from .liveness import check_liveness
from .document import extract_face_from_document
from .ocr import extract_id_info
from .schemas import (
    FaceCaptureResponse,
    IDUploadResponse,
    CompareRequest,
    CompareResponse,
    HealthResponse,
    QualityResponse,
    LivenessResponse,
    PriceRequest,
    PriceResponse,
    SentimentRequest,
    SentimentResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Rate limiting state
_rate_limits: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 10  # requests per window

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3002,http://localhost:8081"
).split(",")

app = FastAPI(
    title="Bridger Face Verification Service",
    version="1.0.0",
    description="AI-powered face verification for identity document matching",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.on_event("startup")
async def startup_event():
    """Pre-load all models so the first request doesn't time out."""
    import asyncio
    loop = asyncio.get_event_loop()

    def _warmup():
        logger.info("Pre-loading face engine...")
        get_engine()
        logger.info("Pre-loading OCR readers...")
        from .ocr import _get_reader_arabic, _get_reader_latin
        _get_reader_arabic()
        _get_reader_latin()
        logger.info("All models loaded — service ready.")

    await loop.run_in_executor(None, _warmup)


def _check_rate_limit(client_ip: str) -> None:
    """Raise 429 if client exceeds rate limit."""
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    # Prune old entries
    _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if t > window_start]
    if len(_rate_limits[client_ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")
    _rate_limits[client_ip].append(now)


def _get_api_key(request: Request) -> None:
    """Validate API key from internal service communication."""
    expected_key = os.getenv("FACE_SERVICE_API_KEY")
    if expected_key:
        provided = request.headers.get("X-Service-Key", "")
        if provided != expected_key:
            raise HTTPException(status_code=401, detail="Unauthorized")


# Lazy-load the engine on first request
_engine: FaceEngine | None = None


def get_engine() -> FaceEngine:
    global _engine
    if _engine is None:
        _engine = FaceEngine.get_instance()
    return _engine


async def _read_image(file: UploadFile) -> np.ndarray:
    """Read an uploaded file into an OpenCV BGR image."""
    contents = await file.read()
    if len(contents) > config.MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds maximum size")

    pil_image = Image.open(io.BytesIO(contents)).convert("RGB")
    image = np.array(pil_image)
    # Convert RGB to BGR for OpenCV
    return cv2.cvtColor(image, cv2.COLOR_RGB2BGR)


# ── Health ──────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", model_loaded=_engine is not None)


# ── Face Capture ────────────────────────────────────────────────

@app.post("/verify/capture-face", response_model=FaceCaptureResponse)
async def capture_face(request: Request, image: UploadFile = File(...)):
    """
    Process a selfie image:
    1. Detect face
    2. Run quality checks (blur, brightness, face size, single face)
    3. Run liveness detection
    4. Extract 512-d ArcFace embedding
    """
    _get_api_key(request)
    _check_rate_limit(request.client.host if request.client else "unknown")
    engine = get_engine()
    img = await _read_image(image)

    # Detect faces
    faces = engine.detect_faces(img)

    # Quality checks
    quality = validate_image_quality(img, faces)
    quality_resp = QualityResponse(
        passed=quality.passed,
        blur_score=round(quality.blur_score, 2),
        brightness=round(quality.brightness, 2),
        face_size=quality.face_size,
        face_count=quality.face_count,
        issues=quality.issues,
    )

    if not quality.passed:
        return FaceCaptureResponse(
            success=False,
            message=f"Quality check failed: {'; '.join(quality.issues)}",
            quality=quality_resp,
        )

    # Liveness detection on the detected face crop
    face = faces[0]
    bbox = face.bbox.astype(int)
    x1, y1, x2, y2 = bbox[:4]
    h, w = img.shape[:2]
    # Clamp to image bounds
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    face_crop = img[y1:y2, x1:x2]

    liveness = check_liveness(face_crop)
    liveness_resp = LivenessResponse(
        is_live=liveness.is_live,
        score=liveness.score,
        checks=liveness.checks,
    )

    if not liveness.is_live:
        return FaceCaptureResponse(
            success=False,
            message="Liveness check failed. Please use a live camera, not a photo.",
            quality=quality_resp,
            liveness=liveness_resp,
        )

    # Extract embedding
    embedding = face.normed_embedding.tolist()

    return FaceCaptureResponse(
        success=True,
        message="Face captured successfully",
        embedding=embedding,
        quality=quality_resp,
        liveness=liveness_resp,
    )


# ── ID Document Upload ─────────────────────────────────────────

@app.post("/verify/upload-id", response_model=IDUploadResponse)
async def upload_id(request: Request, image: UploadFile = File(...)):
    """
    Process an ID document image:
    1. Detect face in the document (with preprocessing fallbacks)
    2. Extract 512-d ArcFace embedding from the document face
    """
    _get_api_key(request)
    _check_rate_limit(request.client.host if request.client else "unknown")
    engine = get_engine()
    img = await _read_image(image)

    result = extract_face_from_document(img, engine)

    if result is None:
        return IDUploadResponse(
            success=False,
            message="Could not detect a face in the document. "
                    "Ensure the photo on your ID is clearly visible.",
        )

    # Run OCR — best-effort, never blocks the response
    try:
        ocr_info = extract_id_info(img)
    except Exception as e:
        logger.warning("OCR raised unexpectedly: %s", e)
        ocr_info = {'id_number': None, 'birthday': None, 'raw_text': ''}

    logger.info("OCR result: id_number=%s birthday=%s raw=%s",
                ocr_info.get("id_number"), ocr_info.get("birthday"),
                (ocr_info.get("raw_text") or "")[:200])

    return IDUploadResponse(
        success=True,
        message="Face extracted from document successfully",
        embedding=result["embedding"].tolist(),
        face_confidence=round(result["confidence"], 3),
        document_face_bbox=result["bbox"],
        id_number=ocr_info.get("id_number"),
        birthday=ocr_info.get("birthday"),
    )


# ── Face Comparison ─────────────────────────────────────────────

@app.post("/verify/compare", response_model=CompareResponse)
async def compare_faces(request: Request, body: CompareRequest):
    """
    Compare two face embeddings and determine if they match.
    Uses cosine similarity with a configurable threshold.
    """
    _get_api_key(request)
    _check_rate_limit(request.client.host if request.client else "unknown")
    face_emb = np.array(body.face_embedding, dtype=np.float32)
    id_emb = np.array(body.id_embedding, dtype=np.float32)

    # Validate embedding dimensions
    if face_emb.shape != (512,) or id_emb.shape != (512,):
        raise HTTPException(
            status_code=400,
            detail="Embeddings must be 512-dimensional vectors",
        )

    similarity = FaceEngine.compare_embeddings(face_emb, id_emb)

    # Three-tier result:
    #  ≥ MANUAL_REVIEW_THRESHOLD (0.65) → APPROVED (auto)
    #  ≥ SIMILARITY_THRESHOLD (0.55) and < 0.65 → MANUAL_REVIEW
    #  < SIMILARITY_THRESHOLD (0.55) → REJECTED
    if similarity >= config.MANUAL_REVIEW_THRESHOLD:
        result = "APPROVED"
        verified = True
        message = "Face matches ID document"
    elif similarity >= config.SIMILARITY_THRESHOLD:
        result = "MANUAL_REVIEW"
        verified = False
        message = "Identity verified with standard confidence"
    else:
        result = "REJECTED"
        verified = False
        message = "Face does not match ID document. Please retake your selfie with good lighting."

    return CompareResponse(
        verified=verified,
        confidence=round(similarity, 4),
        message=message,
        result=result,
    )


# ── ML: Pricing ─────────────────────────────────────────────────

# Lazily loaded pricing model
_pricing_model = None
_pricing_encoder = None

def _get_pricing_model():
    global _pricing_model, _pricing_encoder
    if _pricing_model is None:
        try:
            import joblib
            _pricing_model = joblib.load("/app/models/pricing_model.pkl")
            _pricing_encoder = joblib.load("/app/models/pricing_encoder.pkl")
            logger.info("Pricing model loaded from /app/models/pricing_model.pkl")
        except Exception as e:
            logger.warning("Pricing model not found (%s) — using heuristic fallback", e)
    return _pricing_model, _pricing_encoder


@app.post("/predict/price", response_model=PriceResponse)
async def predict_price(request: Request, body: PriceRequest):
    """Estimate delivery price using ML model (or heuristic fallback)."""
    _get_api_key(request)
    _check_rate_limit(request.client.host if request.client else "unknown")

    model, encoder = _get_pricing_model()

    if model is not None and encoder is not None:
        try:
            import numpy as np
            features = encoder.transform([[
                body.distance_km,
                body.weight_kg,
                body.category,
                body.urgency,
            ]])
            price = float(model.predict(features)[0])
            price = max(price, 2.0)
            margin = price * 0.25
            return PriceResponse(
                estimated_price=round(price, 2),
                min_price=round(max(price - margin, 1.0), 2),
                max_price=round(price + margin, 2),
                confidence=0.85,
                model_version="xgb_v1",
            )
        except Exception as e:
            logger.warning("Pricing model inference failed: %s — using fallback", e)

    # Heuristic fallback (linear approximation)
    urgency_mult = {"NORMAL": 1.0, "EXPRESS": 1.4, "OVERNIGHT": 1.8}.get(body.urgency, 1.0)
    category_add = {"ELECTRONICS": 5.0, "FRAGILE": 4.0, "FOOD": 2.0, "DOCS": -3.0}.get(body.category, 0.0)
    price = max((body.distance_km * 0.08 + body.weight_kg * 3.0 + category_add) * urgency_mult, 3.0)
    return PriceResponse(
        estimated_price=round(price, 2),
        min_price=round(price * 0.8, 2),
        max_price=round(price * 1.2, 2),
        confidence=0.60,
        model_version="heuristic_fallback",
    )


# ── ML: Sentiment / Fraud detection ──────────────────────────────

# Lazily loaded sentiment pipeline
_sentiment_pipeline = None

def _get_sentiment_pipeline():
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        try:
            from transformers import pipeline as hf_pipeline
            _sentiment_pipeline = hf_pipeline(
                "text-classification",
                model="cardiffnlp/twitter-xlm-roberta-base-sentiment",
                device=-1,  # CPU; set 0 for GPU
                top_k=1,
            )
            logger.info("Sentiment model loaded: cardiffnlp/twitter-xlm-roberta-base-sentiment")
        except Exception as e:
            logger.warning("Sentiment model not available (%s) — using keyword fallback", e)
    return _sentiment_pipeline


@app.post("/predict/sentiment", response_model=SentimentResponse)
async def predict_sentiment(request: Request, body: SentimentRequest):
    """Classify review sentiment and detect fraud signals."""
    _get_api_key(request)
    _check_rate_limit(request.client.host if request.client else "unknown")

    text = body.text.strip()
    fraud_signals: list[str] = []

    if not text or len(text) < 3:
        return SentimentResponse(
            label="NEUTRAL", score=0.5,
            is_potentially_fraudulent=False, fraud_signals=[]
        )

    pipeline = _get_sentiment_pipeline()

    if pipeline is not None:
        try:
            result = pipeline(text[:512])[0]
            label_map = {
                "positive": "POSITIVE", "neutral": "NEUTRAL", "negative": "NEGATIVE"
            }
            label = label_map.get(result["label"].lower(), "NEUTRAL")
            score = float(result["score"])
        except Exception as e:
            logger.warning("Sentiment inference failed: %s", e)
            label, score = _keyword_sentiment(text)
    else:
        label, score = _keyword_sentiment(text)

    # Fraud signals
    if body.rating is not None:
        if label == "POSITIVE" and body.rating <= 2:
            fraud_signals.append("sentiment_rating_contradiction")
        if label == "NEGATIVE" and body.rating >= 4:
            fraud_signals.append("sentiment_rating_contradiction")

    if len(text) < 10:
        fraud_signals.append("suspiciously_short_review")

    is_fraud = len(fraud_signals) > 0 or score < 0.45

    return SentimentResponse(
        label=label,
        score=round(score, 4),
        is_potentially_fraudulent=is_fraud,
        fraud_signals=fraud_signals,
    )


def _keyword_sentiment(text: str) -> tuple[str, float]:
    """Simple keyword-based fallback sentiment for when the model is unavailable."""
    text_lower = text.lower()
    positive_words = {"great","excellent","perfect","amazing","love","good","happy","fast","reliable","safe"}
    negative_words = {"bad","terrible","awful","slow","lost","broken","fraud","scam","never","horrible"}
    pos = sum(1 for w in positive_words if w in text_lower)
    neg = sum(1 for w in negative_words if w in text_lower)
    if pos > neg:
        return "POSITIVE", 0.70
    if neg > pos:
        return "NEGATIVE", 0.70
    return "NEUTRAL", 0.55


# ── Run server ──────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True,
    )
