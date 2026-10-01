#!/bin/sh
# Checks a running production stack from the outside: health (and, given them, the release and
# the version it must be running), the app shell, a client-side route, the service worker and the
# headers.
#   sh deploy/smoke-test.sh https://gym.example.com [release [version]]
# CURL_OPTS=--insecure accepts a local certificate (Caddy's own CA with DOMAIN=localhost).
set -eu

base=${1:?usage: smoke-test.sh <base-url> [release [version]]}
release=${2:-}
version=${3:-}

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
if [ -n "$version" ]; then
    echo "$health" | grep -q "\"version\":\"$version\"" ||
        fail "expected version $version, /health says: $health"
fi

headers=$(fetch --head "$base/")
for header in strict-transport-security x-content-type-options x-frame-options \
    content-security-policy-report-only; do
    echo "$headers" | grep -qi "^$header:" || fail "missing header $header"
done

page=$(fetch "$base/progress")
echo "$page" | grep -q '<div id="root">' || fail "/progress is not the app shell"
if [ -n "$version" ]; then
    echo "$page" | grep -q "name=\"app-version\" content=\"$version\"" ||
        fail "the app is not version $version"
fi
fetch --output /dev/null "$base/sw.js" || fail "no service worker"
fetch --output /dev/null "$base/manifest.webmanifest" || fail "no manifest"

echo "smoke test: $base is healthy${release:+ (release $release${version:+, version $version})}"
