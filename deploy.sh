#!/usr/bin/env bash
# Continuous deploy to Azure Container Apps (no local Docker needed).
#
#   ./deploy.sh backend    # test-gate -> cloud build -> roll backend revision
#   ./deploy.sh frontend   # build-gate -> cloud build (with live backend URL) -> roll frontend
#   ./deploy.sh all        # backend, then frontend
#
# Requires: az login (once). Images build in ACR via `az acr build`.
set -euo pipefail

# ---- Config (override in a gitignored .deploy.env if needed) ----------------
RG="${RG:-AdityasRG}"
ACR="${ACR:-AdityasRegstry}"
BACKEND_APP="${BACKEND_APP:-creditrisk-backend}"
FRONTEND_APP="${FRONTEND_APP:-creditrisk-frontend}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$REPO_ROOT/.deploy.env" ] && source "$REPO_ROOT/.deploy.env"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }

command -v az >/dev/null || die "Azure CLI not installed"
az account show >/dev/null 2>&1 || die "Not logged in - run: az login"

ACR_LOGIN_SERVER="$(az acr show -n "$ACR" -g "$RG" --query loginServer -o tsv)"
TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"

# ---- Test gates (abort on failure) ------------------------------------------
gate_backend() {
  log "Backend gate: pytest test_ecl.py"
  ( cd "$REPO_ROOT/src/backend" && "$REPO_ROOT/venv/bin/python" -m pytest -q test_ecl.py ) \
    || die "Backend tests failed - not deploying."
}

gate_frontend() {
  log "Frontend gate: npm run build"
  ( cd "$REPO_ROOT/src/frontend" && npm run build ) \
    || die "Frontend build failed - not deploying."
}

# ---- Deploys -----------------------------------------------------------------
deploy_backend() {
  gate_backend
  log "Cloud-building backend image ($TAG)"
  az acr build -r "$ACR" \
    -t "creditrisk-backend:$TAG" -t "creditrisk-backend:latest" \
    "$REPO_ROOT/src/backend"
  log "Rolling backend revision"
  az containerapp update -n "$BACKEND_APP" -g "$RG" \
    --image "$ACR_LOGIN_SERVER/creditrisk-backend:$TAG" -o none
  log "Backend live: https://$(az containerapp show -n "$BACKEND_APP" -g "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)"
}

deploy_frontend() {
  gate_frontend
  local backend_fqdn
  backend_fqdn="$(az containerapp show -n "$BACKEND_APP" -g "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)"
  [ -n "$backend_fqdn" ] || die "Could not resolve backend FQDN - deploy backend first."
  log "Cloud-building frontend against https://$backend_fqdn ($TAG)"
  az acr build -r "$ACR" \
    -t "creditrisk-frontend:$TAG" -t "creditrisk-frontend:latest" \
    --build-arg VITE_BACKEND_URL="https://$backend_fqdn" \
    "$REPO_ROOT/src/frontend"
  log "Rolling frontend revision"
  az containerapp update -n "$FRONTEND_APP" -g "$RG" \
    --image "$ACR_LOGIN_SERVER/creditrisk-frontend:$TAG" -o none
  log "Frontend live: https://$(az containerapp show -n "$FRONTEND_APP" -g "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)"
}

case "${1:-}" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *)        die "Usage: ./deploy.sh {backend|frontend|all}" ;;
esac

log "Done."
