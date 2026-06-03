# Repository Guidelines

## Project Shape
- `server.js` is the Express API and Mistral orchestration layer.
- `public/` contains the static browser UI.
- Keep API keys server-side. The browser must never submit, store, preview, or log provider keys.

## Local Commands
- Install dependencies with `npm install`.
- Run locally with `MISTRAL_API_KEY=... npm start`.
- Use `node --check server.js` and `node --check public/app.js` after JavaScript changes.
- Run `npm audit --omit=dev` when dependencies change.

## Security Notes
- Treat all model output as untrusted before rendering it in the DOM.
- Keep request body limits and question length limits in place.
- Do not expose raw upstream provider errors to the browser; return concise user-safe messages.
