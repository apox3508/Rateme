# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Rateme Migration (Step 1)

Firebase was removed and Supabase client wiring has been added.

### Supabase env setup

1. Copy `.env.example` to `.env`.
2. Fill in these values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

At this step, rating data is still local in the browser. Shared DB syncing will be added in step 2.

### GitHub Pages deploy secrets

For deploy builds, add these repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
