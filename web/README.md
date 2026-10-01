# Mahi waitlist site (`web/`)

A one-page website where people register their interest in Mahi. It's a small Next.js site that is
exported as plain static files, hosted on Netlify, and uses Netlify Forms to collect sign-ups. It
lives in the same repo as the app (a pnpm workspace) but is completely separate from it: nothing in
here changes the app, and the app's builds and updates never touch this folder.

## Run it on your computer

From the repo root:

```sh
pnpm install        # once, or after pulling new packages
pnpm dev:web        # the site at http://localhost:3000
pnpm build:web      # the finished static site in web/out
pnpm lint:web       # design-token check + ESLint
```

The form won't actually submit locally (that needs Netlify). You'll see the error message instead,
which is expected.

## The design comes from the app

The site uses the app's own design tokens, so the two always match. The only source is the app:

- `src/constants/tokens.ts` — colours, text sizes, spacing, corners, shadows, sizes and so on
- `src/constants/fonts.ts` — Inter and its weights

`web/scripts/build-tokens.mjs` turns those into `web/app/tokens.css` before every `dev` and `build`.
**Never edit `tokens.css` by hand** — change a token in the app, and the website follows. The
classes on the page read straight back to the tokens: `p-s24` is `SPACE.s24`, `text-f17` is
`FONT_SIZE.f17`, `rounded-r24` is `RADIUS.r24`, `bg-paper` is `COLORS.paper`.

`web/scripts/check-tokens.mjs` (part of `lint` and `build`) fails if anyone types a colour, size,
spacing or similar value by hand anywhere in `web/app`, the same way the app's design-token test does.

## One-time Netlify setup (Mahi's Netlify account)

1. In Netlify: **Add new project → Import an existing project → GitHub**, and pick
   `togethermahidev-dev/mahi`.
2. Choose the branch to deploy from (normally `main`). Set **Base directory** to `web`. Leave the
   build command and publish directory empty — `netlify.toml` at the repo root sets them, plus
   Node 22 and the install settings.
3. Deploy. The first deploy always builds.
4. **Forms:** go to **Forms** and turn on **form detection**, then deploy once more (edit
   `web/DEPLOY.md`, see below) so Netlify finds the form. A form called **waitlist** appears.
5. **Email alerts:** **Forms → waitlist → Form notifications → Add notification → Email
   notification**, and enter the address that should hear about each sign-up.
6. Sign-ups appear under **Forms → waitlist** (first name, email, how they train, and whether
   they're happy to test early). You can export them as a CSV from there.

## How to deploy

The site does **not** deploy on every push. Netlify skips every build unless `web/DEPLOY.md`
changed (`web/scripts/netlify-ignore.sh` decides). To deploy:

1. On GitHub, signed in as the Mahi owner account **togethermahidev-dev**, open `web/DEPLOY.md`
   on the branch Netlify deploys (normally `main`).
2. Click the pencil (edit), change the date on the **Last deploy requested:** line, and commit
   straight to that branch.
3. That commit starts the build. It's live a minute or two later — check **Deploys** in Netlify.

Netlify's **Trigger deploy** button and **Clear cache and deploy** also always build.

**Why edit it on GitHub as the owner:** on Netlify's free plan, private repos only build commits
whose Git author is the one contributor linked to the Netlify team; commits by anyone else are
blocked. This repo is public today, so that rule shouldn't apply, but deploying by editing
`DEPLOY.md` as **togethermahidev-dev** sidesteps it either way. If the repo is ever made private,
keep deploying this way.

**Deploying without Git:** after `pnpm build:web`, the Netlify CLI can upload the finished files
directly (sign in to Mahi's Netlify account and link the project first with `netlify login` and
`netlify link`):

```sh
netlify deploy --prod --dir web/out
```

## What's in here

| File | What it does |
|---|---|
| `app/page.tsx` | The page: headline, the waitlist card, how it works, footer |
| `app/_components/WaitlistForm.tsx` | The Netlify form, with loading, success and error states |
| `app/thanks/page.tsx` | Where the form lands if JavaScript is off |
| `app/tokens.css` | Generated from the app's tokens — don't edit |
| `scripts/build-tokens.mjs` | Builds `tokens.css` |
| `scripts/check-tokens.mjs` | Fails on any hand-typed design value (tests: `pnpm --filter ./web test`) |
| `scripts/netlify-ignore.sh` | Skips Netlify builds unless `DEPLOY.md` changed |
| `scripts/netlify-build.sh` | Netlify's build: installs only the website's packages, then builds |
| `DEPLOY.md` | The deploy trigger — edit its date line to deploy |
| `../netlify.toml` | Netlify settings |
