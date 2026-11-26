PYTHON ?= python
PNPM ?= pnpm
COMPOSE ?= docker compose
LOADTEST_ARGS ?= --students 30 --duration 20

.PHONY: help up down logs migrate seed test test-backend test-frontend test-integration lint typecheck contracts e2e smoke loadtest eval

help:
	@echo "DärisAI developer commands"
	@echo "  make up          Build and start the full Docker Compose stack"
	@echo "  make down        Stop the stack"
	@echo "  make logs        Follow service logs"
	@echo "  make migrate     Apply SQL migrations to DATABASE_URL"
	@echo "  make seed        Seed the development professor/course"
	@echo "  make test        Run backend and frontend tests"
	@echo "  make lint        Run Ruff and ESLint"
	@echo "  make typecheck   Run mypy and tsc"
	@echo "  make contracts   Regenerate OpenAPI, WS schema and TypeScript types"
	@echo "  make e2e         Run Playwright against an already-running app"
	@echo "  make smoke       Run the development REST smoke flow"
	@echo "  make loadtest    Run the synthetic WebSocket load test"
	@echo "  make eval        Run the real-embedding Phase 7 evaluation suite"

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

migrate:
	cd backend && $(PYTHON) -m app.migrate

seed:
	cd backend && $(PYTHON) -m app.seed

test: test-backend test-frontend

test-backend:
	cd backend && $(PYTHON) -m pytest -q

test-integration:
	cd backend && $(PYTHON) -m pytest tests/integration tests/security -q

test-frontend:
	cd frontend && $(PNPM) test

lint:
	cd backend && $(PYTHON) -m ruff check app tests
	cd frontend && $(PNPM) lint

typecheck:
	cd backend && $(PYTHON) -m mypy app
	cd frontend && $(PNPM) typecheck

contracts:
	$(PYTHON) scripts/export_schemas.py
	cd frontend && $(PNPM) contracts

e2e:
	cd frontend && $(PNPM) e2e

smoke:
	cd backend && $(PYTHON) ../scripts/smoke.py

loadtest:
	cd backend && $(PYTHON) ../scripts/loadtest.py $(LOADTEST_ARGS)

eval:
	cd backend && $(PYTHON) -m evals.runner
