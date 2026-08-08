FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/server.py ./backend/

# Render/Fly/Railway typically provide PORT
ENV HOST=0.0.0.0
ENV PORT=8000

CMD ["sh", "-c", "cd backend && python -m uvicorn server:app --host ${HOST} --port ${PORT}"]
