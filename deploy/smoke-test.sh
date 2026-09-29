#!/bin/sh
# Checks a running production stack from the outside: health (and, given one, the release it
# must be running), the app shell, a client-side route, the service worker and the headers.
#   sh deploy/smoke-test.sh https://gym.example.com [release]
# CURL_OPTS=--insecure accepts a local certificate (Caddy's own CA with DOMAIN=localhost).
set -eu

base=${1:?usage: smoke-test.sh <base-url> [release]}
release=${2:-}

fail() {
    echo "smoke test: $*" >&2
    exit 1
}

# shellcheck disable=SC2086 # CURL_OPTS holds several options
fetch() {
    curl --silent --show-error --fail --retry 5 --retry-delay 3 --retry-all-errors \
        ${CURL_OPTS:-} "$@"
}

health=$(fetch "$base/health") || fail "/health is not answering 200"
echo "$health" | grep -q '"status":"ok"' || fail "/health: $health"
if [ -n "$release" ]; then
    echo "$health" | grep -q "\"release\":\"$release\"" ||
        fail "expected release $release, /health says: $health"
fi

headers=$(fetch --head "$base/")
for header in strict-transport-security x-content-type-options x-frame-options \
    content-security-policy-report-only; do
    echo "$headers" | grep -qi "^$header:" || fail "missing header $header"
done

fetch "$base/progress" | grep -q '<div id="root">' || fail "/progress is not the app shell"
fetch --output /dev/null "$base/sw.js" || fail "no service worker"
fetch --output /dev/null "$base/manifest.webmanifest" || fail "no manifest"

echo "smoke test: $base is healthy${release:+ (release $release)}"
