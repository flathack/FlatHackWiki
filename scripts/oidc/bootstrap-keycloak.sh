#!/bin/sh
set -eu

log() {
  echo "[keycloak-bootstrap] $*"
}

kcadm_cmd() {
  /opt/keycloak/bin/kcadm.sh "$@"
}

extract_id() {
  tr -d '\n' | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

wait_for_keycloak() {
  attempt=0
  until kcadm_cmd config credentials --server "$KEYCLOAK_URL" --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 90 ]; then
      log "Keycloak ist nicht rechtzeitig erreichbar geworden."
      exit 1
    fi
    sleep 2
  done
}

realm_exists() {
  kcadm_cmd get "realms/$OIDC_REALM" >/dev/null 2>&1
}

client_uuid() {
  kcadm_cmd get clients -r "$OIDC_REALM" -q clientId="$1" --fields id,clientId 2>/dev/null | extract_id || true
}

user_uuid() {
  kcadm_cmd get users -r "$OIDC_REALM" -q username="$1" --fields id,username 2>/dev/null | extract_id || true
}

ensure_realm() {
  if realm_exists; then
    log "Realm $OIDC_REALM existiert bereits."
    kcadm_cmd update "realms/$OIDC_REALM" \
      -s enabled=true \
      -s loginWithEmailAllowed=true \
      -s duplicateEmailsAllowed=false \
      -s resetPasswordAllowed=true \
      -s sslRequired=NONE >/dev/null
    return
  fi

  log "Lege Realm $OIDC_REALM an."
  kcadm_cmd create realms \
    -s realm="$OIDC_REALM" \
    -s enabled=true \
    -s loginWithEmailAllowed=true \
    -s duplicateEmailsAllowed=false \
    -s resetPasswordAllowed=true \
    -s sslRequired=NONE
}

ensure_client() {
  client_id="$1"
  secret="$2"
  root_url="$3"
  redirect_uri="$4"
  web_origin="$5"
  base_url="$6"

  existing_id="$(client_uuid "$client_id")"

  if [ -z "$existing_id" ]; then
    log "Lege Client $client_id an."
    kcadm_cmd create clients -r "$OIDC_REALM" \
      -s clientId="$client_id" \
      -s name="$client_id" \
      -s enabled=true \
      -s protocol=openid-connect \
      -s publicClient=false \
      -s standardFlowEnabled=true \
      -s directAccessGrantsEnabled=false \
      -s implicitFlowEnabled=false \
      -s serviceAccountsEnabled=false \
      -s secret="$secret" \
      -s rootUrl="$root_url" \
      -s baseUrl="$base_url" \
      -s adminUrl="$base_url" \
      -s 'redirectUris=["'"$redirect_uri"'"]' \
      -s 'webOrigins=["'"$web_origin"'"]'
    return
  fi

  log "Aktualisiere Client $client_id."
  kcadm_cmd update "clients/$existing_id" -r "$OIDC_REALM" \
    -s clientId="$client_id" \
    -s name="$client_id" \
    -s enabled=true \
    -s protocol=openid-connect \
    -s publicClient=false \
    -s standardFlowEnabled=true \
    -s directAccessGrantsEnabled=false \
    -s implicitFlowEnabled=false \
    -s serviceAccountsEnabled=false \
    -s secret="$secret" \
    -s rootUrl="$root_url" \
    -s baseUrl="$base_url" \
    -s adminUrl="$base_url" \
    -s 'redirectUris=["'"$redirect_uri"'"]' \
    -s 'webOrigins=["'"$web_origin"'"]'
}

ensure_user() {
  username="$1"
  email="$2"
  first_name="$3"
  last_name="$4"
  password="$5"

  existing_id="$(user_uuid "$username")"

  if [ -z "$existing_id" ]; then
    log "Lege Benutzer $username an."
    kcadm_cmd create users -r "$OIDC_REALM" \
      -s username="$username" \
      -s enabled=true \
      -s emailVerified=true \
      -s email="$email" \
      -s firstName="$first_name" \
      -s lastName="$last_name"
  else
    log "Aktualisiere Benutzer $username."
    kcadm_cmd update "users/$existing_id" -r "$OIDC_REALM" \
      -s username="$username" \
      -s enabled=true \
      -s emailVerified=true \
      -s email="$email" \
      -s firstName="$first_name" \
      -s lastName="$last_name"
  fi

  kcadm_cmd set-password -r "$OIDC_REALM" --username "$username" --new-password "$password" >/dev/null
}

KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
OIDC_REALM="${OIDC_REALM:-flathackwiki}"

wait_for_keycloak
ensure_realm

ensure_client \
  "${WIKI_OIDC_CLIENT_ID:-flathackwiki}" \
  "${WIKI_OIDC_CLIENT_SECRET:?WIKI_OIDC_CLIENT_SECRET fehlt}" \
  "${WIKI_FRONTEND_URL:?WIKI_FRONTEND_URL fehlt}" \
  "${WIKI_APP_URL:?WIKI_APP_URL fehlt}/api/v1/auth/oidc/callback" \
  "${WIKI_FRONTEND_URL:?WIKI_FRONTEND_URL fehlt}" \
  "${WIKI_FRONTEND_URL:?WIKI_FRONTEND_URL fehlt}"

ensure_client \
  "${NEXTCLOUD_OIDC_CLIENT_ID:-nextcloud}" \
  "${NEXTCLOUD_OIDC_CLIENT_SECRET:?NEXTCLOUD_OIDC_CLIENT_SECRET fehlt}" \
  "${NEXTCLOUD_PUBLIC_URL:?NEXTCLOUD_PUBLIC_URL fehlt}" \
  "${NEXTCLOUD_PUBLIC_URL:?NEXTCLOUD_PUBLIC_URL fehlt}/apps/user_oidc/code" \
  "${NEXTCLOUD_PUBLIC_URL:?NEXTCLOUD_PUBLIC_URL fehlt}" \
  "${NEXTCLOUD_PUBLIC_URL:?NEXTCLOUD_PUBLIC_URL fehlt}"

ensure_user "admin" "admin@local.test" "Admin" "Local" "${KEYCLOAK_TEST_ADMIN_PASSWORD:-ChangeMeKeycloak1234}"
ensure_user "steve" "info@stevenschoedel.de" "Steven" "Schoedel" "${KEYCLOAK_TEST_STEVE_PASSWORD:-ChangeMeSteve1234}"
ensure_user "frau" "frau@local.test" "Frau" "Local" "${KEYCLOAK_TEST_FRAU_PASSWORD:-ChangeMeFrau1234}"

log "Keycloak-OIDC-Bootstrap abgeschlossen."