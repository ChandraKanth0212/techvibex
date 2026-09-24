.PHONY: infra-up infra-down dev-mod1 test-mod1 install-contracts

infra-up:
	docker compose up -d

infra-down:
	docker compose down

install-contracts:
	pip install -e packages/canonical-contracts

dev-mod1:
	cd modules/module1-data-hub && uvicorn src.main:app --reload --port 8000

test-mod1:
	cd modules/module1-data-hub && pytest
