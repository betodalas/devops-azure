# devops-azure

A API é um CRUD de "todos" em Node/Express, feito só pra ter algo rodando
(o foco aqui é a infra, não a aplicação). Tem `/health`, `/ready`,
`/metrics`, um `/api/boom` pra forçar erro 500 e um `/api/admin/stats`
protegido por token (pra mostrar uso de Secret).

## Estrutura

```
app/                  # API (Express) + Dockerfile
docker-compose.yml    # sobe a API local
k8s/                  # manifests pro kind
observability/        # Grafana + Loki + Alloy + Prometheus
scripts/              # script de deploy com rollback
.github/workflows/    # CI e publish no GHCR
```

## Docker

```bash
cd app && npm install
cd ..
docker compose up --build
curl localhost:3000/health
```

Dockerfile multi-stage (deps → build com lint/test → runtime final, alpine),
roda como usuário não-root, tudo configurável por env var.

## Kubernetes (kind)

```bash
kind create cluster --config k8s/kind-config.yaml
kubectl apply -k k8s/
```

Pra HPA funcionar no kind precisa instalar o metrics-server manualmente:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

```bash
kubectl get pods -w
kubectl get hpa
curl localhost:8081/api/todos
```

Deployment com 2 réplicas, probes de liveness/readiness, requests/limits,
ConfigMap + Secret pras env vars, HPA de 2 a 5 réplicas (CPU 70%).

Pra testar com imagem local em vez da do GHCR:

```bash
docker build -t devops-azure-api:local --target runtime app
kind load docker-image devops-azure-api:local --name devops-azure
kubectl set image deployment/devops-azure-api api=devops-azure-api:local
```

## CI/CD

- PR → `ci.yml` roda lint, teste e build da imagem (sem publicar).
- Push na `main` → `publish.yml` builda e manda pro GHCR
  (`ghcr.io/<owner>/devops-azure-api`) com tag `latest` e `sha-<commit>`.

Primeira vez, lembrar de deixar o pacote público em
`github.com/<owner>?tab=packages`, senão o kind não consegue puxar a
imagem.

## Observabilidade

```bash
docker compose -f docker-compose.yml -f observability/docker-compose.yml up -d
```

- Grafana: `localhost:3001` (login anônimo)
- Prometheus: `localhost:9090`

Prometheus puxa o `/metrics` da API, Alloy lê os logs dos containers via
docker socket e manda pro Loki, Grafana já sobe com datasource e um
dashboard prontos (requests/s, memória, logs). Pra ver um erro aparecendo:
`curl localhost:3000/api/boom`.

## Script

`scripts/deploy-rollout.sh` faz deploy de uma imagem nova, espera o
rollout terminar e, se falhar, volta sozinho pra imagem anterior.

```bash
./scripts/deploy-rollout.sh ghcr.io/<owner>/devops-azure-api:sha-abc1234
```
