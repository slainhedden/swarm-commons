.PHONY: dev test migrate

dev:
	uv run uvicorn swarm_commons.server:app --reload --port 8000

test:
	uv run --extra test pytest

migrate:
	uv run python -m swarm_commons.migrate
