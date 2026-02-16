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

## ImageKit -> Supabase Auto Ingest

When you upload an image to ImageKit, you can auto-create a `faces` row.

- `name`: generated from filename
- `title`: generated from Wikipedia search
- `status`: auto set to `approved` (auto 공개)

### 1) Deploy the Edge Function

```bash
supabase functions deploy imagekit-webhook
```

Set required secrets:

```bash
supabase secrets set \
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  IMAGEKIT_WEBHOOK_SECRET=<imagekit-webhook-secret> \
  IMAGEKIT_VERIFY_SIGNATURE=true
```

If you only want to test quickly, you can temporarily disable signature check:

```bash
supabase secrets set IMAGEKIT_VERIFY_SIGNATURE=false
```

### 2) Add ImageKit Webhook

In ImageKit Dashboard:

1. Go to `Developer options` -> `Webhooks`.
2. Add webhook endpoint:
   `https://<project-ref>.functions.supabase.co/imagekit-webhook`
3. Subscribe event:
   `upload.pre-transform.success`
4. Copy webhook secret and set it as `IMAGEKIT_WEBHOOK_SECRET` in Supabase.

### 3) Required DB columns

Your `public.faces` table must have:

- `name` (text)
- `title` (text or nullable text)
- `image_url` (text)
- `status` (text)

This app reads only rows where `status = 'approved'`.

### 4) Cost notes (as of 2026-02-16)

- Supabase Edge Functions: free tier exists, but usage over free limits is paid.
- ImageKit: free plan exists; webhook and API usage can still hit plan limits.
- Wikipedia API used for title lookup is free, but rate-limited and best-effort.

So this flow can run at zero cost for low traffic, but it is not "unlimited free".
