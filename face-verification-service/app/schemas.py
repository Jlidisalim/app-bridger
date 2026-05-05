"""Pydantic request/response models for the Face Verification API."""

from pydantic import BaseModel


class QualityResponse(BaseModel):
    passed: bool
    blur_score: float
    brightness: float
    face_size: int
    face_count: int
    issues: list[str]


class LivenessResponse(BaseModel):
    is_live: bool
    score: float
    checks: dict[str, float]


class FaceCaptureResponse(BaseModel):
    success: bool
    message: str
    embedding: list[float] | None = None
    quality: QualityResponse | None = None
    liveness: LivenessResponse | None = None


class IDUploadResponse(BaseModel):
    success: bool
    message: str
    embedding: list[float] | None = None
    face_confidence: float | None = None
    document_face_bbox: list[int] | None = None
    # OCR-extracted fields (name/lastname entered manually by user)
    id_number: str | None = None
    birthday: str | None = None


class CompareRequest(BaseModel):
    face_embedding: list[float]
    id_embedding: list[float]


class CompareResponse(BaseModel):
    verified: bool
    confidence: float
    message: str
    result: str = "REJECTED"  # APPROVED | MANUAL_REVIEW | REJECTED


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# ── ML / Pricing ──────────────────────────────────────────────────────────────

class PriceRequest(BaseModel):
    distance_km: float
    weight_kg: float
    category: str = "GENERAL"   # GENERAL, ELECTRONICS, FOOD, FRAGILE, DOCS
    urgency: str = "NORMAL"     # NORMAL, EXPRESS, OVERNIGHT


class PriceResponse(BaseModel):
    estimated_price: float
    min_price: float
    max_price: float
    confidence: float           # 0.0 – 1.0
    model_version: str


# ── ML / Sentiment ────────────────────────────────────────────────────────────

class SentimentRequest(BaseModel):
    text: str
    rating: int | None = None   # 1-5, used for contradiction check


class SentimentResponse(BaseModel):
    label: str                  # POSITIVE | NEUTRAL | NEGATIVE
    score: float                # confidence 0.0-1.0
    is_potentially_fraudulent: bool
    fraud_signals: list[str]
