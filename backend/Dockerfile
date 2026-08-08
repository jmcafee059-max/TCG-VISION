FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# Render/Fly/Railway typically provide PORT
ENV HOST=0.0.0.0
ENV PORT=8000

CMD ["sh", "-c", "python -m uvicorn server:app --host ${HOST} --port ${PORT}"]
