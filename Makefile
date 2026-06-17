.PHONY: build up down k8s-up k8s-down k8s-status logs

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

k8s-up:
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmaps/
	kubectl apply -f k8s/secrets/
	kubectl apply -f k8s/persistent-volumes/
	kubectl apply -f k8s/deployments/
	kubectl apply -f k8s/services/
	kubectl apply -f k8s/ingress/
	kubectl apply -f k8s/monitoring/
	@echo "ShopKube deployed to Kubernetes"
	@echo "Run: kubectl get all -n shopkube"

k8s-down:
	kubectl delete namespace shopkube --ignore-not-found

k8s-status:
	kubectl get all -n shopkube

logs:
	docker compose logs -f $(SERVICE)
