# Agent Guidelines

- This project ships a server-rendered EJS + Bootstrap interface. Keep new UI strings in Traditional Chinese and favor the existing partials for shared layout.
- Business logic is organized in the `src` folder using Express routes and PostgreSQL models; follow the current patterns (model functions + server routes) when adding backend features.
- Contract flows rely on statuses like `PENDING_SIGNATURE` and `SIGNED`, verification codes, and signing link tokens. Preserve these concepts when extending the signing experience.
- Do not introduce client-side build steps or SPA frameworks; stick to vanilla JS that works with the existing static assets.
