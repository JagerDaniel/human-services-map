# Human Services Web Map — Kittitas & Yakima Counties, WA

Public web map of free food, housing, and mental-health services for people
in need across Kittitas and Yakima counties, Washington.

**This repo is the deployed site only** (three static files, no build step),
served via GitHub Pages. Data lives in a read-only ArcGIS hosted feature
layer; the pipeline that discovers, verifies, and publishes the data is
maintained privately. Every record is human-reviewed against its source
before it appears here.

- Hours are shown in Pacific time; open/closed is computed in the browser
  with [opening_hours.js](https://github.com/opening-hours/opening_hours.js).
- Places with unknown hours are always shown — call ahead to confirm.
- Confidential providers (e.g. domestic-violence shelters) are listed
  phone-only, with no address or map point, by design.

**See something wrong or missing?** Every listing has a "Report a correction"
link, or email **correctionscw@gmail.com**.

## Updating the site

The source of truth is the private pipeline repo (`webmap/` folder). To
deploy a change: run `sync.cmd` (copies the three files here), review the
diff, commit, push. GitHub Pages redeploys automatically.
