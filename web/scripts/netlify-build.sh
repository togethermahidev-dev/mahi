#!/usr/bin/env bash
# Netlify's build command (netlify.toml); Netlify runs it from web/.
# Installs only the website's packages, never the Expo app's: `pnpm deploy` copies web/ to
# ../.web-deploy with just its own dependencies (from the repo's lockfile). The site is built
# there and the finished files are moved back to web/out, Netlify's publish folder.
# (pnpm 12 installs the whole workspace even with --filter, so a plain filtered install won't do.)
set -euo pipefail

PNPM="npx --yes pnpm@12.4.2"
cd ..
rm -rf .web-deploy
$PNPM --filter ./web deploy --prod=false .web-deploy
(cd .web-deploy && $PNPM run build)
rm -rf web/out
mv .web-deploy/out web/out
