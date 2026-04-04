# ── Stage 1: Build React dashboard ───────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend/dashboard
COPY frontend/dashboard/package*.json ./
RUN npm ci --silent
COPY frontend/dashboard/ ./
RUN npm run build

# ── Stage 2: Python API ───────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY alembic/ alembic/
COPY alembic.ini .
COPY data/ data/

# Widget HTML/JS/CSS (served by FastAPI StaticFiles)
COPY frontend/widget/ frontend/widget/

# React dashboard build output
COPY --from=frontend-builder /app/frontend/dashboard/dist/ frontend/dashboard/dist/

WORKDIR /app/backend

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
