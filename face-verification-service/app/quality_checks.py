"""
Image and face quality validation checks.
Prevents photo attacks, low-quality images, and invalid submissions.
"""

import cv2
import numpy as np
from dataclasses import dataclass
from . import config


@dataclass
class QualityResult:
    passed: bool
    blur_score: float
    brightness: float
    face_size: int
    face_count: int
    issues: list[str]


def check_blur(gray_image: np.ndarray) -> tuple[float, bool]:
    """Detect blur using Laplacian variance. Lower = blurrier."""
    score = cv2.Laplacian(gray_image, cv2.CV_64F).var()
    return float(score), score >= config.BLUR_THRESHOLD


def check_brightness(gray_image: np.ndarray) -> tuple[float, bool]:
    """Check mean brightness is within acceptable range."""
    mean_brightness = float(np.mean(gray_image))
    ok = config.BRIGHTNESS_MIN <= mean_brightness <= config.BRIGHTNESS_MAX
    return mean_brightness, ok


def check_face_size(face_bbox: np.ndarray) -> tuple[int, bool]:
    """Ensure the detected face is large enough for reliable comparison."""
    x1, y1, x2, y2 = face_bbox[:4]
    width = int(x2 - x1)
    height = int(y2 - y1)
    size = min(width, height)
    return size, size >= config.MIN_FACE_SIZE


def validate_image_quality(image: np.ndarray, faces: list) -> QualityResult:
    """
    Run all quality checks on an image and its detected faces.
    Returns a QualityResult with pass/fail and detailed issues.
    """
    issues: list[str] = []
    face_count = len(faces)

    # Image dimension check
    h, w = image.shape[:2]
    if min(h, w) < config.MIN_IMAGE_SIZE:
        issues.append(f"Image too small ({w}x{h}). Minimum {config.MIN_IMAGE_SIZE}px required.")

    # Convert to grayscale for quality analysis
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Blur detection — use face region if available (more accurate for mobile cameras)
    if face_count == 1:
        bbox = faces[0].bbox.astype(int)
        x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), min(w, bbox[2]), min(h, bbox[3])
        face_gray = gray[y1:y2, x1:x2]
        blur_score, blur_ok = check_blur(face_gray) if face_gray.size > 0 else check_blur(gray)
    else:
        blur_score, blur_ok = check_blur(gray)
    if not blur_ok:
        issues.append(f"Image is too blurry (score: {blur_score:.1f}, min: {config.BLUR_THRESHOLD})")

    # Brightness check
    brightness, brightness_ok = check_brightness(gray)
    if not brightness_ok:
        if brightness < config.BRIGHTNESS_MIN:
            issues.append(f"Image is too dark (brightness: {brightness:.0f})")
        else:
            issues.append(f"Image is too bright/overexposed (brightness: {brightness:.0f})")

    # Face count check
    if face_count == 0:
        issues.append("No face detected in the image")
    elif face_count > config.MAX_FACES_ALLOWED:
        issues.append(f"Multiple faces detected ({face_count}). Only one face allowed.")

    # Face size check
    face_size = 0
    if face_count == 1:
        face_size, size_ok = check_face_size(faces[0].bbox)
        if not size_ok:
            issues.append(
                f"Face is too small ({face_size}px). "
                f"Move closer to the camera (min: {config.MIN_FACE_SIZE}px)."
            )

    passed = len(issues) == 0
    return QualityResult(
        passed=passed,
        blur_score=blur_score,
        brightness=brightness,
        face_size=face_size,
        face_count=face_count,
        issues=issues,
    )
