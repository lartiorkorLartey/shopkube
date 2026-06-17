FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup --no-create-home --shell /bin/false appuser

COPY . .

EXPOSE 8085

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8085/health')" || exit 1

CMD ["supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
