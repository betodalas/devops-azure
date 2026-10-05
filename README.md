# devops-azure

Teste de DevOps: containerizar uma API REST simples, rodar em Kubernetes
local, montar pipeline de CI/CD publicando no GHCR e adicionar
observabilidade (logs + métricas) com Grafana/Loki/Alloy/Prometheus.

A aplicação é uma API de "todos" em Node.js/Express, escrita à mão
(simples o suficiente para não ser o foco da avaliação, que é a
infraestrutura). Endpoints: `GET/POST /api/todos`, `GET/PUT/DELETE
/api/todos/:id`, `GET /api/boom` (gera erro 500 para demo), `GET
/api/admin/stats` (protegido por `ADMIN_TOKEN`, vindo de um Secret), além de
`/health`, `/ready` e `/metrics`.

## Estrutura

```
app/                  # código da API (Express) + Dockerfile multi-stage
docker-compose.yml    # roda só a API localmente
k8s/                  # manifests para kind/k3d
observability/        # stack Grafana + Loki + Alloy + Prometheus
scripts/              # script de deploy/rollback
.github/workflows/    # CI (PR) e publish (push na main -> GHCR)
```

## 1. Docker

```bash
cd app && npm install   # gera package-lock.json na primeira vez
cd ..
docker compose up --build
curl localhost:3000/health
```

Boas práticas aplicadas no `app/Dockerfile`:
- multi-stage (`deps` → `build` com lint/test → `runtime` final enxuto,
  `node:20-alpine`);
- usuário não-root (`USER node`);
- nenhum segredo/baked-in config — tudo via env vars (`PORT`, `LOG_LEVEL`,
  `APP_NAME`, `ADMIN_TOKEN`);
- `HEALTHCHECK` nativo da imagem.

## 2. Kubernetes local (kind)

```bash
kind create cluster --config k8s/kind-config.yaml
kubectl apply -k k8s/

# metrics-server é necessário para o HPA funcionar em kind (sem ele a HPA
# fica "unknown"); o patch --kubelet-insecure-tls é só para ambiente local.
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

kubectl get pods -w
kubectl get hpa
curl localhost:8081/api/todos   # via NodePort mapeado no kind-config.yaml
```

Manifests em `k8s/`: `Deployment` (2 réplicas, probes de liveness/readiness,
`resources`, `securityContext` não-root), `Service` (ClusterIP) +
`service-nodeport.yaml` (acesso local sem Ingress), `ConfigMap`/`Secret`
para env vars, e `HorizontalPodAutoscaler` (CPU 70%, 2-5 réplicas).

Para o build local da imagem chegar ao cluster sem precisar de um registry:
```bash
docker build -t devops-azure-api:local --target runtime app
kind load docker-image devops-azure-api:local --name devops-azure
kubectl set image deployment/devops-azure-api api=devops-azure-api:local
```

## 3. CI/CD (GitHub Actions + GHCR)

- `.github/workflows/ci.yml`: em pull request que toca `app/`, roda
  `npm ci`, `eslint`, `node --test` e um `docker build` (sem push) — valida
  que a imagem builda antes de mergear.
- `.github/workflows/publish.yml`: em push na `main`, builda e publica em
  `ghcr.io/<owner>/devops-azure-api` com tags `latest` e `sha-<commit>`,
  usando `GITHUB_TOKEN` (sem segredos extras a configurar).

Depois do primeiro push na `main`, torne o pacote público em
`https://github.com/betodalas?tab=packages` (ou deixe privado e use um
`imagePullSecret` no cluster).

## 4. Observabilidade

```bash
docker compose -f docker-compose.yml -f observability/docker-compose.yml up -d
# Grafana:    http://localhost:3001 (login anônimo como Admin)
# Prometheus: http://localhost:9090
```

- **Prometheus** faz scrape de `/metrics` da API (métricas default do
  Node.js + `http_requests_total` / `http_request_duration_seconds`
  customizadas).
- **Alloy** lê os logs dos containers Docker (via socket) e envia para o
  **Loki**.
- **Grafana** já vem com datasources (Prometheus + Loki) e um dashboard
  (`devops-azure-api overview`) provisionados automaticamente: painel de
  requests/s por status code, memória do processo, e um painel de logs.
- Para gerar erro e ver nos logs/no painel: `curl localhost:3000/api/boom`.

## 5. Script de automação

`scripts/deploy-rollout.sh` — opção escolhida: **deploy de nova imagem +
espera do rollout + rollback automático em caso de falha**. Justificativa e
comentários estão no próprio script.

```bash
./scripts/deploy-rollout.sh ghcr.io/betodalas/devops-azure-api:sha-abc1234
```

## O que eu faria diferente em produção

- Ingress + cert-manager em vez de NodePort; HPA baseado também em métricas
  customizadas (requests/s) via Prometheus Adapter; Secrets via
  SOPS/External Secrets em vez de YAML commitado; retenção/alerting
  configurados no Prometheus (hoje não há `Alertmanager`); GHCR com
  assinatura/verificação de imagem (cosign) no pipeline.
