# Frontend

The trading terminal UI for the Indian Market Trading Agent: Next.js 16 (App Router), Tailwind CSS, shadcn/ui on Base UI, and Open Sans, with light, dark and system themes. The [root README](../README.md) covers features and full setup. [CONTRIBUTING.md](../CONTRIBUTING.md) covers the pull request workflow.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The backend must be running. When you open the UI on `localhost`, it calls the API at the same host on port 8000. Set `NEXT_PUBLIC_API_URL` to point it somewhere else. A deployed build with no setting uses its own origin.

## Checks

CI runs all three on every push to `main` and every pull request:

```bash
npm run lint       # ESLint (Next.js core-web-vitals + TypeScript rules), must report 0 problems
npx tsc --noEmit   # typecheck
npm run build      # production build
```

## Layout

- `src/app/`: one folder per page (Today, Top Picks, Scanner, Strategies, Analysis, Simulation, the calibration pages, Settings, …)
- `src/components/`: feature components (`dashboard/`, `analysis/`, `history/`, `settings/`, `portfolio/`). `ui/` holds the shadcn primitives.
- `src/lib/`:
  - `api.ts`: REST and WebSocket client
  - `store.ts`: Zustand store for the running analysis
  - `types.ts`: shared types
  - `utils.ts`: `cn`, `errorMessage`
  - `status-colors.ts`: theme-aware status colours
  - `help-content.ts`: help text

## Conventions

- **API responses:** functions in `lib/api.ts` return `Promise<unknown>`. Declare a local type for the response shape you read, taken from the backend route, and assert it at the call site with `(await getX()) as XResponse`. Don't use `any`.
- **Errors:** use `catch (e) { toast.error(errorMessage(e, "Failed to …")) }`.
- **Loading data in effects:** keep `setState` out of the synchronous part of an effect.
  - A `fetchData()` function sets state only inside promise callbacks, and the effect calls it.
  - A `load()` function calls `setLoading(true)` and then `fetchData()`. Refresh buttons use it.
- **Lint:** fix the code instead of adding `eslint-disable` comments or turning rules off.
- **Next.js version:** this release differs from older Next.js docs. Check `node_modules/next/dist/docs/` before relying on an API (see `AGENTS.md`).
