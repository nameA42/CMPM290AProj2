# Research Dashboard

A clean, private dashboard for organizing research: papers, notes, citations, deadlines and project progress.
It is a static site (plain HTML, CSS and JavaScript — no build step, no dependencies) designed for GitHub Pages.
**All data is stored locally in your browser** (localStorage + IndexedDB). Nothing is uploaded.

## Features

- **Home** – overdue and upcoming deadlines (with a 14-day strip), progress for every project across its four phases, reading queue and recent notes.
- **Projects** split into four phases: **Gathering Materials → Experimentation → Analysis → Paper Writing**. Each phase has tasks (with optional due dates), notes and its own tools:
  - *Gathering Materials* – a reading list linked to your library, plus `.bib` export for the project.
  - *Experimentation* – an experiment log (hypothesis, setup, results, code reference, custom fields).
  - *Analysis* – a **graph studio**: upload CSV/TSV, paste cells, or link a Google Sheet; build line, bar, scatter, area, histogram and box plots; aggregation with mean ± SD/SE error bars, grouping, filtering, trend lines with R², log scale; export PNG/SVG.
  - *Paper Writing* – Overleaf button, target venue, submission deadline, per-section status and word counts.
- **Links** to each project's Google Drive folder, GitHub repository (with optional public activity feed) and Overleaf project.
- **Papers & Citations** – DOI lookup (Crossref), BibTeX import/export, APA / MLA / Chicago / IEEE / BibTeX formatting, tags, ratings, reading status.
- **Notes** with simple Markdown, linked to projects and papers.
- **Deadlines** – list and calendar views, `.ics` export for Google/Outlook/Apple Calendar.
- **Settings** – light/dark theme, accent color, JSON backup & restore, sample data.

Extra options live behind the **Advanced** toggles in each section so the default view stays simple.

## Run locally

ES modules need to be served over HTTP (opening `index.html` directly won't work):

```
python -m http.server 8080
```

Then open http://localhost:8080.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to it (the `index.html` must be at the repository root).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, choose `main` and `/ (root)`.
3. Your dashboard will be live at `https://<username>.github.io/<repository>/` after a minute.

The `.nojekyll` file tells GitHub Pages to serve the files as-is.

## Privacy

- Data lives only in the browser you use. Export a backup (Settings → Export backup) to move it to another computer or keep it safe.
- The app only makes network requests when you click something that needs one: DOI lookup (api.crossref.org), GitHub activity (api.github.com, public repos) and Google Sheets import/refresh. Drive, GitHub and Overleaf links simply open in a new tab.
- Google Sheets must be shared as "Anyone with the link can view" (or published to the web) to be imported.

## Project structure

```
index.html          App shell
css/styles.css      All styles (light & dark themes)
js/app.js           Hash router
js/store.js         State, persistence, progress & deadline logic
js/idb.js           IndexedDB storage for datasets
js/ui.js            DOM helpers, modals, icons, markdown
js/csv.js           CSV parsing + Google Sheets fetching
js/charts.js        Dependency-free SVG chart renderer
js/cite.js          BibTeX parsing, citation styles, DOI lookup
js/sample.js        Sample project
js/views/*.js       Pages (home, projects, papers, notes, deadlines, settings, graph studio)
```
