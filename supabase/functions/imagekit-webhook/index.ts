const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const IMAGEKIT_WEBHOOK_SECRET = Deno.env.get('IMAGEKIT_WEBHOOK_SECRET')
const ENABLE_SIGNATURE_CHECK = (Deno.env.get('IMAGEKIT_VERIFY_SIGNATURE') ?? 'true') === 'true'

type ImageKitWebhookPayload = {
  id?: string
  type?: string
  createdAt?: string
  data?: {
    fileId?: string
    filePath?: string
    name?: string
    url?: string
    fileType?: string
  }
}

type FacesInsert = {
  name: string
  title: string
  image_url: string
  status: 'approved'
}

function toBytes(input: string) {
  return new TextEncoder().encode(input)
}

function toBase64(bytes: ArrayBuffer) {
  const arr = new Uint8Array(bytes)
  let binary = ''
  for (const byte of arr) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

async function hmacSha256Base64(secretBytes: Uint8Array, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, toBytes(message))
  return toBase64(signature)
}

function parseWebhookSecret(secret: string) {
  if (secret.startsWith('whsec_')) {
    const raw = secret.slice('whsec_'.length)
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  return toBytes(secret)
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

function extractV1Signatures(signatureHeader: string) {
  return signatureHeader
    .split(' ')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.split(','))
    .filter(([version, value]) => version === 'v1' && !!value)
    .map(([, value]) => value)
}

async function verifyStandardWebhookSignature(req: Request, body: string) {
  if (!ENABLE_SIGNATURE_CHECK) {
    return true
  }
  if (!IMAGEKIT_WEBHOOK_SECRET) {
    throw new Error('IMAGEKIT_WEBHOOK_SECRET is required when signature verification is enabled.')
  }

  const webhookId = req.headers.get('webhook-id')
  const webhookTimestamp = req.headers.get('webhook-timestamp')
  const webhookSignature = req.headers.get('webhook-signature')

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  const timestamp = Number(webhookTimestamp)
  if (!Number.isFinite(timestamp)) {
    return false
  }
  if (Math.abs(now - timestamp) > 300) {
    return false
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`
  const expected = await hmacSha256Base64(parseWebhookSecret(IMAGEKIT_WEBHOOK_SECRET), signedContent)
  const candidates = extractV1Signatures(webhookSignature)
  return candidates.some((candidate) => safeEqual(candidate, expected))
}

function normalizeName(fileName: string) {
  const noExt = fileName.replace(/\.[^/.]+$/, '')
  const decoded = decodeURIComponent(noExt)
  const withSpaces = decoded.replace(/[_-]+/g, ' ')
  const noHashTail = withSpaces.replace(/\s+[a-z0-9]{6,}$/i, '')
  const normalized = noHashTail.replace(/\s+/g, ' ').trim()
  return normalized || 'Unknown'
}

function sentenceClamp(text: string, max = 120) {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= max) return singleLine
  return `${singleLine.slice(0, max - 1).trimEnd()}…`
}

async function fetchWikiTitle(name: string) {
  const targets = [
    { wikiApi: 'https://ko.wikipedia.org/w/api.php', summaryBase: 'https://ko.wikipedia.org/api/rest_v1/page/summary/' },
    { wikiApi: 'https://en.wikipedia.org/w/api.php', summaryBase: 'https://en.wikipedia.org/api/rest_v1/page/summary/' },
  ]

  for (const target of targets) {
    const searchUrl = new URL(target.wikiApi)
    searchUrl.searchParams.set('action', 'opensearch')
    searchUrl.searchParams.set('search', name)
    searchUrl.searchParams.set('limit', '1')
    searchUrl.searchParams.set('namespace', '0')
    searchUrl.searchParams.set('format', 'json')

    const searchRes = await fetch(searchUrl)
    if (!searchRes.ok) continue

    const searchJson = (await searchRes.json()) as [string, string[]]
    const firstTitle = searchJson?.[1]?.[0]
    if (!firstTitle) continue

    const summaryRes = await fetch(`${target.summaryBase}${encodeURIComponent(firstTitle)}`)
    if (!summaryRes.ok) continue

    const summaryJson = (await summaryRes.json()) as { extract?: string; description?: string }
    const summary = summaryJson.extract ?? summaryJson.description
    if (!summary) continue

    return sentenceClamp(summary)
  }

  return `${name}에 대한 평가 항목`
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function upsertFace(face: FacesInsert) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  const checkUrl = `${SUPABASE_URL}/rest/v1/faces?select=id&image_url=eq.${encodeURIComponent(face.image_url)}&limit=1`
  const checkRes = await fetch(checkUrl, { headers })
  if (!checkRes.ok) {
    const text = await checkRes.text()
    throw new Error(`faces lookup failed: ${text}`)
  }
  const existing = (await checkRes.json()) as Array<{ id: number }>

  if (existing.length > 0) {
    const patchUrl = `${SUPABASE_URL}/rest/v1/faces?id=eq.${existing[0].id}`
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(face),
    })
    if (!patchRes.ok) {
      const text = await patchRes.text()
      throw new Error(`faces patch failed: ${text}`)
    }
    return { action: 'updated', id: existing[0].id }
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/faces`, {
    method: 'POST',
    headers,
    body: JSON.stringify(face),
  })
  if (!insertRes.ok) {
    const text = await insertRes.text()
    throw new Error(`faces insert failed: ${text}`)
  }
  const inserted = (await insertRes.json()) as Array<{ id: number }>
  return { action: 'inserted', id: inserted[0]?.id ?? null }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const body = await req.text()
  const verified = await verifyStandardWebhookSignature(req, body)
  if (!verified) {
    return jsonResponse(401, { error: 'Invalid webhook signature' })
  }

  const payload = JSON.parse(body) as ImageKitWebhookPayload
  if (payload.type !== 'upload.pre-transform.success') {
    return jsonResponse(202, { ignored: true, reason: 'unsupported_event', type: payload.type ?? null })
  }

  const fileType = payload.data?.fileType?.toLowerCase()
  if (fileType && fileType !== 'image') {
    return jsonResponse(202, { ignored: true, reason: 'non_image' })
  }

  const imageUrl = payload.data?.url?.split('?')[0]
  if (!imageUrl) {
    return jsonResponse(400, { error: 'Missing image URL in webhook payload.' })
  }

  const rawName = payload.data?.name ?? payload.data?.filePath?.split('/').pop() ?? 'unknown'
  const name = normalizeName(rawName)
  const title = await fetchWikiTitle(name)

  const result = await upsertFace({
    name,
    title,
    image_url: imageUrl,
    status: 'approved',
  })

  return jsonResponse(200, {
    ok: true,
    eventType: payload.type,
    name,
    title,
    imageUrl,
    result,
  })
})
