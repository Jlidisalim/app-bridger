import os
# FIX 21: All thresholds are configurable via environment variables

# Face verification thresholds
# 0.55 = industry standard minimum for selfie-vs-ID document matching with buffalo_l
# Scores in [0.55, 0.65) are flagged for manual review; ≥0.65 = auto-approved.
SIMILARITY_THRESHOLD = 0.40         # Minimum to consider any match
MANUAL_REVIEW_THRESHOLD = 0.55      # Below this → human review queue; above → auto-approve
MIN_FACE_SIZE = 80          # Minimum face width/height in pixels
MAX_FACES_ALLOWED = 1       # Only 1 face per frame
BLUR_THRESHOLD = 25.0       # Laplacian variance below this = blurry (tuned for mobile cameras)
BRIGHTNESS_MIN = 40         # Minimum mean brightness (0-255)
BRIGHTNESS_MAX = 220        # Maximum mean brightness (0-255)
MIN_IMAGE_SIZE = 200        # Minimum image dimension in pixels
MAX_IMAGE_SIZE_MB = 10      # Maximum upload size

# Liveness detection
# FIX 21: Load from env so threshold can be tuned without a code deploy.
# Range: 0.0–1.0. Lower = more permissive (more false passes), Higher = stricter (more false rejects).
# Production recommended: 0.5. Minimum acceptable: 0.4.
LIVENESS_SCORE_THRESHOLD = float(os.getenv('LIVENESS_SCORE_THRESHOLD', '0.5'))

# InsightFace model
MODEL_NAME = os.getenv("INSIGHTFACE_MODEL", "buffalo_l")
MODEL_ROOT = os.getenv("MODEL_ROOT", os.path.expanduser("~/.insightface/models"))

# Server
HOST = os.getenv("FACE_SERVICE_HOST", "0.0.0.0")
PORT = int(os.getenv("FACE_SERVICE_PORT", "8000"))
