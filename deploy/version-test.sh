#!/bin/sh
# Checks version.sh against a throwaway repository: sh deploy/version-test.sh
set -eu

script=$(cd "$(dirname "$0")" && pwd)/version.sh
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init --quiet
git config user.email test@example.com
git config user.name Test
git config commit.gpgsign false
git config tag.gpgsign false

commit() {
    git commit --quiet --allow-empty "$@"
}

expect() { # expect <version> [commit]
    got=$(sh "$script" ${2:+"$2"})
    if [ "$got" != "$1" ]; then
        echo "version-test: expected $1, got $got (${3:-$(git log -1 --format=%s)})" >&2
        exit 1
    fi
}

commit -m "feat: the first screens"
commit -m "fix: a typo"
expect 1.0.0 # nothing released yet
git tag v1.0.0

expect 1.0.0 # the released commit itself
commit -m "docs: how to deploy"
expect 1.0.1
commit -m "fix(auth): refresh once"
expect 1.0.1 # one deploy, one step, however many commits
commit -m "feat(body): weigh on the scale"
expect 1.1.0
commit -m "chore: tidy up"
expect 1.1.0
feature=$(git rev-parse HEAD)
git tag v1.1.0

commit -m "fix: features are not fixes"
expect 1.1.1
git tag v1.1.1
commit -m "feat(api)!: one connection per source"
expect 2.0.0
git tag v2.0.0
commit -m "refactor: drop the old paths" -m "BREAKING CHANGE: /api/health is gone"
expect 3.0.0

expect 1.1.0 "$feature" "a rollback shows that release's version"
git tag not-a-version
expect 3.0.0 # other tags are not versions
commit -m "feature flags are not a feat: prefix"
expect 3.0.0

echo "version-test: ok"
