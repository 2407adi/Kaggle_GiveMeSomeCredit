# backend/Dockerfile
FROM python:3.12.0-slim

# Install system deps required by some python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (do NOT copy .env - we'll mount it at runtime)
COPY . .

ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

# Run using uvicorn pointing to your app module (app.py has `app = FastAPI(...)`)
CMD ["uvicorn", "serve_local:app", "--host", "0.0.0.0", "--port", "8000"]