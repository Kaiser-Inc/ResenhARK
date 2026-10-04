.DEFAULT_GOAL := help
.PHONY: help up down install dev lint typecheck test

PNPM := PATH="$$HOME/.local/bin:$$PATH" pnpm

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start Redis
	docker compose up -d --wait redis

down: ## Stop containers
	docker compose down

install: ## pnpm install on the host
	$(PNPM) install

dev: ## Run all apps in dev mode (via turbo)
	$(PNPM) dev

lint: ## biome check (via turbo)
	$(PNPM) lint

typecheck: ## tsc --noEmit (via turbo)
	$(PNPM) typecheck

test: ## Run tests (starts Redis for integration)
	docker compose up -d --wait redis
	$(PNPM) test
