FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

# Install system deps and hermes
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app /app/backend/app
COPY --from=frontend-builder /app/backend/static /app/backend/static

# Default env
ENV PYTHONPATH=/app
ENV HERMES_HOME=/root/.hermes
EXPOSE 3100

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "3100"]
