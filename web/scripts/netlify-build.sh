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
# The Apple file that lets invite and post links open the app lives in a dot-folder, which a
# package copy may leave out. Copy it straight from the repo so it is always published.
mkdir -p web/out/.well-known
cp web/public/.well-known/apple-app-site-association web/out/.well-known/
