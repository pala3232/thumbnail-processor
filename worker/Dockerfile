# Dockerfile for the video thumbnail worker
# Base image: python:3.11-slim
# Installs ffmpeg, runs as non-root, optimizes Docker cache

FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m workeruser

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

COPY main.py ./

USER workeruser

ENTRYPOINT ["python", "main.py"]
