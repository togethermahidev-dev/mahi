#!/usr/bin/env bash
# Netlify's "ignore" rule for the waitlist site (see netlify.toml). Netlify runs it from web/
# before every build. Exit 0 = SKIP the build, exit 1 = BUILD.
#
# Builds only when web/DEPLOY.md changed since the last deployed commit — the owner's deploy
# button (web/README.md, "How to deploy"). Also builds when there's nothing to compare with:
# the first deploy, after "Clear cache and deploy", or a manual "Trigger deploy" of the commit
# that's already live.
set -u

TRIGGER="web/DEPLOY.md"
LAST="${CACHED_COMMIT_REF:-}"
THIS="${COMMIT_REF:-}"

if [ -z "$LAST" ] || [ -z "$THIS" ] || [ "$LAST" = "$THIS" ]; then
  echo "netlify-ignore: no earlier deploy to compare with, so building."
  exit 1
fi

cd "$(git rev-parse --show-toplevel)" || exit 1

if ! git cat-file -e "${LAST}^{commit}" 2>/dev/null; then
  echo "netlify-ignore: last deployed commit ${LAST} isn't in this clone, so building to be safe."
  exit 1
fi

if git diff --quiet "$LAST" "$THIS" -- "$TRIGGER"; then
  echo "netlify-ignore: ${TRIGGER} hasn't changed since the last deploy, so skipping this build."
  exit 0
fi

echo "netlify-ignore: ${TRIGGER} changed, so building."
exit 1
