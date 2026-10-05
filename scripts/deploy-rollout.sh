#!/usr/bin/env bash
#
# deploy-rollout.sh
#
# Deploys a new image to a Kubernetes Deployment, waits for the rollout to
# finish, and automatically rolls back if it fails.
#
# Why this option (vs. a cluster health report or a log-error summary): the
# interview asks us to demo the Kubernetes deployment live, so a script that
# *drives* a real rollout (and safely undoes a bad one) demonstrates both the
# Kubernetes manifests and operational judgement in the same 4-minute slot.
#
# Why bash and not a kubectl Job/Helm hook: it needs to run from the
# operator's laptop against kind, with zero extra cluster-side components,
# and to be readable end-to-end in a short demo.
set -euo pipefail

# ---- configurable inputs (env vars > flags > sane defaults) ---------------
NAMESPACE="${NAMESPACE:-default}"
DEPLOYMENT="${DEPLOYMENT:-devops-azure-api}"
CONTAINER="${CONTAINER:-api}"
IMAGE="${1:-}"
TIMEOUT="${TIMEOUT:-120s}"

usage() {
  echo "Usage: $0 <new-image:tag>" >&2
  echo "Env overrides: NAMESPACE, DEPLOYMENT, CONTAINER, TIMEOUT" >&2
  exit 1
}

[[ -z "$IMAGE" ]] && usage

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# Fail fast with a clear message if kubectl can't reach the cluster at all,
# instead of letting every later command time out individually.
if ! kubectl --namespace "$NAMESPACE" get deployment "$DEPLOYMENT" >/dev/null 2>&1; then
  log "ERROR: deployment '$DEPLOYMENT' not found in namespace '$NAMESPACE'."
  exit 1
fi

# Capture the currently running image so we have an explicit rollback
# target. We don't rely solely on 'kubectl rollout undo' history because
# that can be ambiguous if multiple rollouts happened recently.
PREVIOUS_IMAGE="$(kubectl --namespace "$NAMESPACE" get deployment "$DEPLOYMENT" \
  -o jsonpath="{.spec.template.spec.containers[?(@.name=='$CONTAINER')].image}")"

log "Current image:  $PREVIOUS_IMAGE"
log "Target image:    $IMAGE"
log "Rolling out '$DEPLOYMENT' in namespace '$NAMESPACE'..."

kubectl --namespace "$NAMESPACE" set image "deployment/$DEPLOYMENT" "$CONTAINER=$IMAGE" --record=false

# 'kubectl rollout status' blocks until every new pod is Ready (or the
# deployment's progressDeadlineSeconds is hit) and returns non-zero on
# failure -- that's the single signal we need to decide rollback vs success.
if kubectl --namespace "$NAMESPACE" rollout status "deployment/$DEPLOYMENT" --timeout="$TIMEOUT"; then
  log "Rollout succeeded. '$DEPLOYMENT' is now running '$IMAGE'."
  exit 0
fi

log "Rollout FAILED or timed out after $TIMEOUT. Rolling back to '$PREVIOUS_IMAGE'..."
kubectl --namespace "$NAMESPACE" set image "deployment/$DEPLOYMENT" "$CONTAINER=$PREVIOUS_IMAGE" --record=false

if kubectl --namespace "$NAMESPACE" rollout status "deployment/$DEPLOYMENT" --timeout="$TIMEOUT"; then
  log "Rollback completed. '$DEPLOYMENT' is back on '$PREVIOUS_IMAGE'."
else
  log "ERROR: rollback itself failed to stabilize. Manual intervention required."
  exit 2
fi

# Non-zero so CI/CD callers can tell "deployed but had to roll back" apart
# from a clean success, even though the cluster is healthy again.
exit 1
