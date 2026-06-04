# Repository Guidelines

## Project Shape
- `server.js` is the Express API and Mistral orchestration layer.
- `public/` contains the static browser UI.
- Keep API keys server-side. The browser must never submit, store, preview, or log provider keys.

## Local Commands
- Install dependencies with `npm install`.
- Run locally with `npm start` after setting `MISTRAL_API_KEY` in the shell or process manager.
- Use `npm run check` after JavaScript changes.
- Use `npm test` for the native Node.js unit tests.
- Run `npm audit --omit=dev` when dependencies change.

## Security Notes
- Treat all model output as untrusted before rendering it in the DOM.
- Keep request body limits and question length limits in place.
- Keep model-supplied tool-call arguments bounded before streaming them to the browser or feeding simulated tools.
- Do not expose raw upstream provider errors to the browser; return concise user-safe messages.
