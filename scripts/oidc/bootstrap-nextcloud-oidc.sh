#!/bin/sh
set -eu

log() {
  echo "[nextcloud-oidc-bootstrap] $*"
}

docker_exec() {
  docker exec "$NEXTCLOUD_CONTAINER_NAME" sh -lc "$1"
}

occ() {
  docker_exec "su -s /bin/sh www-data -c 'php /var/www/html/occ $*'"
}

wait_for_nextcloud() {
  attempt=0
  until occ "status" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 120 ]; then
      log "Nextcloud ist nicht rechtzeitig bereit geworden."
      exit 1
    fi
    sleep 5
  done
}

wait_for_discovery() {
  attempt=0
  until docker_exec "php -r \"exit(@file_get_contents('${OIDC_DISCOVERY_URI}') === false ? 1 : 0);\"" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 120 ]; then
      log "OIDC-Discovery ist nicht erreichbar: $OIDC_DISCOVERY_URI"
      exit 1
    fi
    sleep 5
  done
}

append_provider_option() {
  help_text="$1"
  option_name="$2"
  option_value="$3"

  if printf '%s' "$help_text" | grep -q -- "$option_name"; then
    PROVIDER_OPTIONS="$PROVIDER_OPTIONS $option_name=$option_value"
  fi
}

OIDC_DISCOVERY_URI="${OIDC_DISCOVERY_URI:?OIDC_DISCOVERY_URI fehlt}"
NEXTCLOUD_CONTAINER_NAME="${NEXTCLOUD_CONTAINER_NAME:-flathackwiki-nextcloud}"
NEXTCLOUD_OIDC_PROVIDER_ID="${NEXTCLOUD_OIDC_PROVIDER_ID:-FlathackID}"

wait_for_nextcloud
wait_for_discovery

log "Installiere/aktiviere user_oidc."
occ "app:install user_oidc" >/dev/null 2>&1 || true
occ "app:enable user_oidc" >/dev/null 2>&1 || true

log "Setze Nextcloud-Systemwerte fuer OIDC."
occ "config:system:set allow_local_remote_servers --type=boolean --value=true"
occ "config:system:set user_oidc login_label --type=string --value=Mit\ FlathackID\ anmelden"
occ "config:system:set user_oidc default_token_endpoint_auth_method --type=string --value='client_secret_post'"
occ "config:app:set --type=boolean --value=1 user_oidc allow_multiple_user_backends"

PROVIDER_HELP="$(occ "user_oidc:provider --help" 2>/dev/null || true)"
PROVIDER_OPTIONS=""
append_provider_option "$PROVIDER_HELP" "--mapping-uid" "preferred_username"
append_provider_option "$PROVIDER_HELP" "--mapping-display-name" "name"
append_provider_option "$PROVIDER_HELP" "--mapping-email" "email"
append_provider_option "$PROVIDER_HELP" "--mapping-groups" "groups"
append_provider_option "$PROVIDER_HELP" "--group-provisioning" "1"
append_provider_option "$PROVIDER_HELP" "--unique-uid" "0"

log "Konfiguriere den Nextcloud-OIDC-Provider."
occ "user_oidc:provider ${NEXTCLOUD_OIDC_PROVIDER_ID} --clientid='${NEXTCLOUD_OIDC_CLIENT_ID:?NEXTCLOUD_OIDC_CLIENT_ID fehlt}' --clientsecret='${NEXTCLOUD_OIDC_CLIENT_SECRET:?NEXTCLOUD_OIDC_CLIENT_SECRET fehlt}' --discoveryuri='${OIDC_DISCOVERY_URI}'${PROVIDER_OPTIONS}"

log "Nextcloud-OIDC-Bootstrap abgeschlossen."