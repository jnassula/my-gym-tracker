#!/bin/sh
# Prints the app's version for a commit (default: HEAD), worked out from the git history. Nobody
# edits a version number: each deploy gets the next one from what was committed since the last.
#
#   sh deploy/version.sh [commit]
#
# The versions already released are the tags vMAJOR.MINOR.PATCH, which the deploy creates once a
# release is live (.github/workflows/deploy.yml). For a commit:
#   - that has such a tag: that version (the same release again, or a rollback);
#   - otherwise the last tag before it, raised by what its commits say (Conventional Commits):
#       "type!:" or a "BREAKING CHANGE:" line  ->  major
#       "feat:"                                ->  minor
#       anything else (fix, docs, chore…)      ->  patch
#   - with no tag before it: FIRST_VERSION.
set -eu

ref=${1:-HEAD}
FIRST_VERSION=1.0.0
TAGS='v[0-9]*.[0-9]*.[0-9]*'

if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    echo "version.sh: needs the full history and its tags (fetch-depth: 0)" >&2
    exit 1
fi

tagged=$(git tag --points-at "$ref" --list "$TAGS" --sort=-v:refname | head -n 1)
if [ -n "$tagged" ]; then
    echo "${tagged#v}"
    exit 0
fi

last=$(git describe --tags --abbrev=0 --match "$TAGS" "$ref" 2>/dev/null || true)
if [ -z "$last" ]; then
    echo "$FIRST_VERSION"
    exit 0
fi

released=${last#v}
major=${released%%.*}
minor=${released#*.}
minor=${minor%%.*}
patch=${released##*.}
if git log --format=%s "$last..$ref" | grep -Eq '^[a-z]+(\([^)]*\))?!:' ||
    git log --format=%b "$last..$ref" | grep -q '^BREAKING CHANGE:'; then
    major=$((major + 1)) minor=0 patch=0
elif git log --format=%s "$last..$ref" | grep -Eq '^feat(\([^)]*\))?:'; then
    minor=$((minor + 1)) patch=0
else
    patch=$((patch + 1))
fi
echo "$major.$minor.$patch"
