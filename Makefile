PY := $(CURDIR)/.venv/bin/python
PIP := $(CURDIR)/.venv/bin/pip

.PHONY: setup seed test dev backend frontend build reset-demo pack register smoke-gemini calc

setup:
	python3 -m venv .venv
	$(PIP) install -q --upgrade pip
	$(PIP) install -q -r backend/requirements-dev.txt
	cd frontend && npm install --no-audit --no-fund

seed:
	cd backend && $(PY) -m app.cli seed

test:
	cd backend && $(PY) -m pytest

# Backend on :8000, Vite dev server on :5173 (proxies /api). Ctrl-C stops both.
dev:
	@echo "Open http://localhost:5173  (API: http://localhost:8000/api/health)"
	@trap 'kill 0' INT TERM; \
	(cd backend && APP_ENV=dev $(CURDIR)/.venv/bin/uvicorn app.main:app --port 8000) & \
	(cd frontend && npm run dev -- --port 5173 --strictPort) & \
	wait

backend:
	cd backend && APP_ENV=dev $(CURDIR)/.venv/bin/uvicorn app.main:app --port 8000

frontend:
	cd frontend && npm run dev -- --port 5173

build:
	cd frontend && npm run build

reset-demo:
	@cd backend && time $(PY) -m app.cli reset-demo

pack:
	$(PY) scripts/make_demo_pack.py

register:
	$(PY) scripts/gen_register.py

smoke-gemini:
	$(PY) scripts/smoke_gemini.py

calc:
	$(PY) scripts/independent_calc.py
