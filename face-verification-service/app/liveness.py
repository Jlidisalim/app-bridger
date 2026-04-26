"""
Basic liveness detection to prevent photo/screen attacks.

Checks:
1. Texture analysis (LBP variance) – printed photos have less texture variation
2. Color distribution – screens/prints differ from real skin
3. Reflection detection – screen glare patterns
4. Edge density – printed photos have different edge characteristics
"""

import os
import cv2
import numpy as np
from dataclasses import dataclass
# FIX 21: Import threshold from config instead of hardcoding
from . import config


@dataclass
class LivenessResult:
    is_live: bool
    score: float
    checks: dict[str, float]


def _lbp_variance(gray: np.ndarray) -> float:
    """Local Binary Pattern variance – real faces have higher micro-texture variance."""
    h, w = gray.shape
    if h < 3 or w < 3:
        return 0.0

    center = gray[1:-1, 1:-1].astype(np.float32)
    patterns = np.zeros_like(center, dtype=np.uint8)
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]

    for i, (dy, dx) in enumerate(offsets):
        neighbor = gray[1 + dy : h - 1 + dy, 1 + dx : w - 1 + dx].astype(np.float32)
        patterns |= ((neighbor >= center).astype(np.uint8) << i)

    return float(np.var(patterns))


def _color_moments(image: np.ndarray) -> float:
    """
    Analyze color distribution in YCrCb space.
    Real skin has characteristic Cr/Cb distributions.
    """
    ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
    cr = ycrcb[:, :, 1].astype(np.float32)
    cb = ycrcb[:, :, 2].astype(np.float32)

    cr_std = np.std(cr)
    cb_std = np.std(cb)

    # Real faces have moderate color variation (not too uniform, not too noisy)
    score = min(cr_std, cb_std) / max(cr_std, cb_std + 1e-6)
    return float(np.clip(score, 0, 1))


def _edge_density(gray: np.ndarray) -> float:
    """
    Compute edge density using Canny.
    Printed photos tend to have different edge characteristics than real faces.
    """
    edges = cv2.Canny(gray, 100, 200)
    density = np.sum(edges > 0) / edges.size
    return float(density)


def _reflection_check(gray: np.ndarray) -> float:
    """
    Detect bright spots that might indicate screen reflection.
    Returns a score where lower = more reflections detected.
    """
    _, bright_mask = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)
    bright_ratio = np.sum(bright_mask > 0) / bright_mask.size

    # A small amount of brightness is normal; excessive = screen/glare
    if bright_ratio > 0.15:
        return 0.2  # Likely a screen
    return 1.0 - bright_ratio


def check_liveness(face_image: np.ndarray) -> LivenessResult:
    """
    Run liveness checks on a cropped face image.

    Args:
        face_image: BGR face crop (not the full frame)

    Returns:
        LivenessResult with overall score and individual check results
    """
    gray = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)

    lbp_score = _lbp_variance(gray)
    color_score = _color_moments(face_image)
    edge_score = _edge_density(gray)
    reflection_score = _reflection_check(gray)

    # Normalize LBP variance to 0-1 range (empirical thresholds)
    lbp_normalized = float(np.clip(lbp_score / 3000.0, 0, 1))

    # Normalize edge density (real faces typically 0.05-0.15)
    edge_normalized = float(np.clip(edge_score / 0.15, 0, 1))

    # Weighted combination
    weights = {
        "texture": 0.35,
        "color": 0.25,
        "edges": 0.20,
        "reflection": 0.20,
    }

    scores = {
        "texture": lbp_normalized,
        "color": color_score,
        "edges": edge_normalized,
        "reflection": reflection_score,
    }

    overall = sum(scores[k] * weights[k] for k in weights)

    # FIX 21: Use config.LIVENESS_SCORE_THRESHOLD (env-configurable) instead of hardcoded 0.35
    return LivenessResult(
        is_live=overall >= config.LIVENESS_SCORE_THRESHOLD,
        score=round(overall, 3),
        checks=scores,
    )
