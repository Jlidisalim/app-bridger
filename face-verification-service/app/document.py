"""
ID Document face extraction.
Detects and extracts the face photo from identity documents
(passport, national ID, driver's license).
"""

import cv2
import numpy as np
import logging
from typing import Optional
from .face_engine import FaceEngine

logger = logging.getLogger(__name__)


def extract_face_from_document(
    image: np.ndarray,
    engine: FaceEngine,
) -> Optional[dict]:
    """
    Extract the face from an ID document image.

    Strategy:
    1. Try face detection on the original image
    2. If no face found, try preprocessing (contrast enhancement, rotation)
    3. Return the largest detected face (ID photo is usually the biggest face)

    Returns:
        dict with 'embedding', 'bbox', 'face_crop', 'confidence' or None
    """
    faces = _detect_with_preprocessing(image, engine)

    if not faces:
        logger.warning("No face found in document image")
        return None

    # Pick the largest face (most likely the ID photo, not a watermark)
    largest = max(faces, key=lambda f: _face_area(f.bbox))
    x1, y1, x2, y2 = [int(v) for v in largest.bbox[:4]]

    # Add padding around face crop
    h, w = image.shape[:2]
    pad = int(max(x2 - x1, y2 - y1) * 0.2)
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)

    face_crop = image[y1:y2, x1:x2]

    # Use the embedding extracted by InsightFace during full-image detection.
    # Re-cropping and re-detecting degrades cross-domain similarity with live selfies
    # because the model computes embeddings most reliably from the full scene context.
    embedding = largest.normed_embedding

    return {
        "embedding": embedding,
        "bbox": [x1, y1, x2, y2],
        "face_crop": face_crop,
        "confidence": float(largest.det_score),
    }


def _detect_with_preprocessing(
    image: np.ndarray,
    engine: FaceEngine,
) -> list:
    """Try multiple preprocessing strategies to find a face."""

    # Attempt 1: raw image
    faces = engine.detect_faces(image)
    if faces:
        return faces

    # Attempt 2: enhance contrast (helps with faded/glossy documents)
    enhanced = _enhance_contrast(image)
    faces = engine.detect_faces(enhanced)
    if faces:
        return faces

    # Attempt 3: upscale small images
    h, w = image.shape[:2]
    if max(h, w) < 800:
        scale = 800 / max(h, w)
        upscaled = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        faces = engine.detect_faces(upscaled)
        if faces:
            return faces

    # Attempt 4: try rotations (document might be sideways)
    for angle in [90, 180, 270]:
        rotated = _rotate_image(image, angle)
        faces = engine.detect_faces(rotated)
        if faces:
            return faces

    return []


def _enhance_face_for_embedding(face_crop: np.ndarray) -> np.ndarray:
    """
    Gently upscale a small ID face crop so InsightFace has enough pixels.
    Heavy preprocessing (denoising, sharpening, strong CLAHE) hurts cross-domain
    similarity with live selfies — the model handles moderate variation well on its own.
    """
    h, w = face_crop.shape[:2]

    # Upscale only if really small (InsightFace internally resizes to 112×112)
    target = 224
    if min(h, w) < target:
        scale = target / min(h, w)
        face_crop = cv2.resize(face_crop, None, fx=scale, fy=scale,
                               interpolation=cv2.INTER_LANCZOS4)

    return face_crop


def _enhance_contrast(image: np.ndarray) -> np.ndarray:
    """Apply CLAHE contrast enhancement."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(l_channel)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def _rotate_image(image: np.ndarray, angle: int) -> np.ndarray:
    """Rotate image by 90/180/270 degrees."""
    if angle == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    elif angle == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    elif angle == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return image


def _face_area(bbox: np.ndarray) -> float:
    x1, y1, x2, y2 = bbox[:4]
    return (x2 - x1) * (y2 - y1)
