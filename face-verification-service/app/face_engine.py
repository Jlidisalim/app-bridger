"""
Face Detection, Embedding, and Verification Engine
Uses InsightFace (RetinaFace detector + ArcFace embeddings)
"""

import logging
import numpy as np
import cv2
from insightface.app import FaceAnalysis
from scipy.spatial.distance import cosine
from typing import Optional
from . import config

logger = logging.getLogger(__name__)


class FaceEngine:
    """Singleton face analysis engine using InsightFace."""

    _instance: Optional["FaceEngine"] = None

    def __init__(self):
        logger.info("Loading InsightFace model: %s", config.MODEL_NAME)
        self.app = FaceAnalysis(
            name=config.MODEL_NAME,
            root=config.MODEL_ROOT,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        # det_size controls the input resolution for the detector
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        logger.info("InsightFace model loaded successfully")

    @classmethod
    def get_instance(cls) -> "FaceEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Detection ───────────────────────────────────────────────

    def detect_faces(self, image: np.ndarray) -> list:
        """Detect all faces in an image. Returns list of InsightFace Face objects."""
        return self.app.get(image)

    # ── Embedding ───────────────────────────────────────────────

    def get_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Detect the single face in the image and return its 512-d ArcFace embedding.
        Returns None if no face or multiple faces detected.
        """
        faces = self.detect_faces(image)
        if len(faces) != 1:
            return None
        return faces[0].normed_embedding

    def get_embedding_from_face(self, face) -> np.ndarray:
        """Extract embedding from an already-detected face object."""
        return face.normed_embedding

    # ── Comparison ──────────────────────────────────────────────

    @staticmethod
    def compare_embeddings(
        embedding_a: np.ndarray,
        embedding_b: np.ndarray,
    ) -> float:
        """
        Compare two face embeddings using cosine similarity.
        Returns a similarity score between 0 and 1.
        """
        similarity = 1 - cosine(embedding_a, embedding_b)
        return float(similarity)

    @staticmethod
    def is_match(similarity: float) -> bool:
        return similarity >= config.SIMILARITY_THRESHOLD
