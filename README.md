# Rateme (React + Supabase)

Supabase Auth(email/password) 기반 `회원가입/로그인`과 평점 저장/조회가 동작합니다.

## Supabase CLI 연결

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase projects list
```

## Supabase env setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Supabase Auth 설정

Supabase Dashboard -> Authentication -> Providers 에서 `Email` provider를 켭니다.

- Email Confirm ON: 회원가입 후 메일 인증 뒤 로그인 가능
- Email Confirm OFF: 회원가입 직후 세션 즉시 생성

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
supabase functions deploy imagekit-webhook --no-verify-jwt
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

### 2-1) Add Pull Sync Function (recommended for manual uploads)

Deploy:

```bash
supabase functions deploy imagekit-sync --no-verify-jwt
```

Set secrets:

```bash
supabase secrets set \
  IMAGEKIT_PRIVATE_KEY=<imagekit-private-key> \
  IMAGEKIT_FOLDER=/rateme \
  IMAGEKIT_SYNC_LIMIT=100 \
  IMAGEKIT_SYNC_TOKEN=<random-long-token>
```

Run sync (manual trigger):

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/imagekit-sync?limit=100&token=<sync-token>"
```

This sync reads files from ImageKit and upserts `faces` rows by `image_url`.

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
