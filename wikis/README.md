# Wikis section

The dashboard's **Wikis** page (`/wikis`) lists game/reference wikis. Each wiki is a
self-contained page shown full-height inside the dashboard at `/wikis/<id>`.

## Pieces

| Where | What |
|---|---|
| `FE/personal_dashboard/src/wikis/registry.js` | The list of wikis shown on `/wikis` |
| `FE/personal_dashboard/src/pages/Wikis.js`, `WikiViewer.js` | Index page and the full-height viewer (iframe) |
| `FE/personal_dashboard/public/wiki-apps/<id>/` | The wiki page itself (`index.html` + any data files) |
| `FE/personal_dashboard/public/wiki-apps/bridge.js` | Gives wiki pages storage, sign-in and the AI helper through the dashboard |
| `wikis_api.py` | Backend: `/wikis/<id>/docs` document store (MySQL `wiki_docs`) and `/wikis/ai/*` chat relay |
| `wikis/<id>_seed.json` | Optional starting data, imported once when that wiki has no documents yet |

## Adding a wiki

1. Put the page at `public/wiki-apps/<id>/index.html` and load the bridge before its own script:
   `<script src="../bridge.js" data-wiki="<id>"></script>`.
2. Add an entry to `registry.js`.
3. Optionally add `wikis/<id>_seed.json` (`{"<collection>": {"<doc id>": {...}}}`).

Storage rules: shared collections are readable by every signed-in user and writable by admins;
`data/users/u<user id>` is private to that user (the bridge maps `data/users/me`).

## AI helper

`/wikis/ai/chat` uses Claude when `ANTHROPIC_API_KEY` is set in `secrets.json`
(model `claude-opus-5-5`, override with `WIKI_AI_MODEL`), otherwise the local Ollama model
(`OLLAMA_URL` / `OLLAMA_MODEL`). With neither available the chat button stays hidden.

## Enshrouded

`wiki-apps/enshrouded/` is the Enshrouded Field Guide (guide, skill tree planner with build
helper, 3,343-entry encyclopedia, quests). Encyclopedia data comes from the Enshrouded Wiki
(enshrouded.wiki.gg, CC BY-SA 4.0); each entry links its source.
