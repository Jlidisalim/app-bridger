FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV + model downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    wget \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.2.2 torchvision==0.17.2
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download InsightFace buffalo_l model (avoids cold-start timeout on first request)
RUN python -c "from insightface.app import FaceAnalysis; FaceAnalysis(name='buffalo_l').prepare(ctx_id=-1, det_size=(640,640))"

# Pre-download EasyOCR models for English, French, Arabic
RUN python -c "import easyocr; easyocr.Reader(['en', 'ar'])"
RUN python -c "import easyocr; easyocr.Reader(['en', 'fr'])"

# Pre-download multilingual sentiment model (~480 MB)
RUN python -c "\
from transformers import pipeline; \
pipeline('text-classification', model='cardiffnlp/twitter-xlm-roberta-base-sentiment', device=-1)" \
  || echo 'Warning: sentiment model download failed — will use keyword fallback'

# Create models directory for pricing model (populated at runtime via training script)
RUN mkdir -p /app/models

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
