FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY swarm_commons ./swarm_commons
RUN pip install --no-cache-dir .
ENV SWARM_SEED=0
USER 65534:65534
EXPOSE 8000
CMD ["sh", "-c", ": \"${DATABASE_URL:?DATABASE_URL must point to PostgreSQL}\" && python -m swarm_commons.migrate && exec uvicorn swarm_commons.server:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers"]
