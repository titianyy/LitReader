# LitReader

[![CI](https://github.com/titianyy/LitReader/actions/workflows/ci.yml/badge.svg)](https://github.com/titianyy/LitReader/actions/workflows/ci.yml)

LitReader is a private, local-first scientific literature reading log. The shipped app is the single portable file `LitReader.html`.

For macOS, the packaged `dist/LitReader.app` opens the same app in its own native window. `dist/LitReader-macOS.zip` is the transferable copy.

## Features

- Enter a DOI to retrieve title, authors, journal, year, URL, and subject tags from Crossref or DataCite.
- Capture key points, methods, limitations, personal thinking, next steps, status, rating, and tags.
- Track daily reading with a 16-week activity heatmap and reading streak.
- Export the local library to XLSX or JSON backup.
- Optionally sync to Google Sheets and import from or send notes to Zotero.
- Keep everything local by default with no account or server required.

## Use it

1. On macOS, download `dist/LitReader-macOS.zip`, unzip it, and open LitReader. On other systems, open `LitReader.html` in a modern browser.
2. Add article details and reading notes, then choose **Save note**.
3. Use **Export XLSX** for an Excel/Google Sheets-ready copy.
4. Open the connection menu (`…`) for optional Google Sheets and Zotero setup.

Notes are stored in the browser profile used to open the file. Use **Connections & data → Local data → Download backup** before moving the file, clearing browser data, or switching browsers.

## Development

The application source is TypeScript in `src/litreader.ts`. `npm run standalone` compiles it and combines the JavaScript, styles, and markup into `LitReader.html`.

Run `npm run package:mac` to build and ad-hoc sign the macOS app bundle.

## CI/CD

Every push and pull request to `main` runs lint, tests, and the production build, then stores the standalone HTML as a workflow artifact for 14 days.

To publish a release, push a version tag. The release workflow builds the universal macOS app on a macOS runner and attaches both the app ZIP and standalone HTML to a GitHub Release:

```sh
git tag v1.4
git push origin v1.4
```
