FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.lock.txt /app/backend/requirements.lock.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.lock.txt
COPY backend/*.py /app/backend/
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --create-home tempo && mkdir /data && chown tempo:tempo /data
ENV TEMPO_DB=/data/tempo.db
USER tempo
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
