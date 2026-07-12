# Portal Skins Admin

This is a static GitHub Pages admin panel for editing `portal_entitlements.json`.

## What It Does

- Loads `portal_skins.json`.
- Loads `portal_entitlements.json`.
- Lets you search existing UUIDs.
- Lets you add a new UUID.
- Shows every portal skin as a checkable list.
- Saves changes by committing the updated `portal_entitlements.json` back to GitHub.

No mod change is needed as long as the JSON format stays compatible with the current mod.

## Where To Put It

Copy this folder into your `portal-skins` repo, for example:

```text
admin/
  index.html
  styles.css
  app.js
```

Then enable GitHub Pages for that repo. If the repo is public, GitHub Pages is available on the free plan.

## Token Setup

Do not put a token directly in the code.

Create a fine-grained GitHub token:

1. Open GitHub.
2. Go to Settings.
3. Go to Developer settings.
4. Go to Personal access tokens.
5. Choose Fine-grained tokens.
6. Generate a new token.
7. Repository access: only `Sellingbakedpotatoes/portal-skins`.
8. Repository permissions: `Contents` set to `Read and write`.
9. Copy the token.

Paste that token into the admin page in your browser. The page only sends it to `api.github.com`.

## Defaults

The admin page is prefilled for:

```text
owner: Sellingbakedpotatoes
repo: portal-skins
branch: main
skins path: portal_skins.json
entitlements path: portal_entitlements.json
```

You can change these in the page if needed.
