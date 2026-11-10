FROM python:3.12-slim

# Node (npx) é exigido pelo modo agente do rae; o Chromium vem do Playwright.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && npx -y playwright install --with-deps chromium

COPY worker ./worker
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh && useradd -m worker && mkdir -p /data && chown worker /data
USER worker

ENV DATA_DIR=/data PORT=8080
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
