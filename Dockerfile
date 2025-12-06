FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    iverilog \
    yosys \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY fixtures/ ./fixtures/

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
