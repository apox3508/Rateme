const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const IMAGEKIT_PRIVATE_KEY = Deno.env.get('IMAGEKIT_PRIVATE_KEY')
const IMAGEKIT_API_BASE = Deno.env.get('IMAGEKIT_API_BASE') ?? 'https://api.imagekit.io/v1'
const IMAGEKIT_FOLDER = Deno.env.get('IMAGEKIT_FOLDER') ?? ''
const IMAGEKIT_SYNC_LIMIT = Number(Deno.env.get('IMAGEKIT_SYNC_LIMIT') ?? 100)
const IMAGEKIT_SYNC_TOKEN = Deno.env.get('IMAGEKIT_SYNC_TOKEN')

type ImageKitFile = {
  name?: string
  filePath?: string
  url?: string
  type?: string
  fileType?: string
}

type FacesInsert = {
  name: string
  title: string
  image_url: string
  status: 'approved'
}

function toBase64Utf8(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function normalizeName(fileName: string) {
  const noExt = fileName.replace(/\.[^/.]+$/, '')
  const decoded = decodeURIComponent(noExt)
  const withSpaces = decoded.replace(/[_-]+/g, ' ')
  const normalized = withSpaces.replace(/\s+/g, ' ').trim()
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

function hasValidSyncToken(req: Request) {
  if (!IMAGEKIT_SYNC_TOKEN) return true
  const url = new URL(req.url)
  const token = req.headers.get('x-sync-token') ?? url.searchParams.get('token')
  return token === IMAGEKIT_SYNC_TOKEN
}

async function fetchImageKitFiles(limit: number) {
  if (!IMAGEKIT_PRIVATE_KEY) {
    throw new Error('IMAGEKIT_PRIVATE_KEY is required.')
  }
  const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 1000)) : IMAGEKIT_SYNC_LIMIT
  const url = new URL(`${IMAGEKIT_API_BASE}/files`)
  url.searchParams.set('limit', String(bounded))
  if (IMAGEKIT_FOLDER) {
    url.searchParams.set('path', IMAGEKIT_FOLDER)
  }

  const auth = toBase64Utf8(`${IMAGEKIT_PRIVATE_KEY}:`)
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ImageKit files API failed: ${res.status} ${text}`)
  }
  const files = (await res.json()) as ImageKitFile[]
  return files
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }
  if (!hasValidSyncToken(req)) {
    return jsonResponse(401, { error: 'Invalid sync token' })
  }

  try {
    const url = new URL(req.url)
    const requestedLimit = Number(url.searchParams.get('limit') ?? IMAGEKIT_SYNC_LIMIT)
    const files = await fetchImageKitFiles(requestedLimit)

    const imageFiles = files.filter((file) => {
      const kind = (file.fileType ?? file.type ?? '').toLowerCase()
      return !kind || kind === 'image'
    })

    let inserted = 0
    let updated = 0

    for (const file of imageFiles) {
      const imageUrl = file.url?.split('?')[0]
      if (!imageUrl) continue

      const rawName = file.name ?? file.filePath?.split('/').pop() ?? imageUrl.split('/').pop() ?? 'unknown'
      const name = normalizeName(rawName)
      const title = await fetchWikiTitle(name)

      const result = await upsertFace({
        name,
        title,
        image_url: imageUrl,
        status: 'approved',
      })

      if (result.action === 'inserted') inserted += 1
      if (result.action === 'updated') updated += 1
    }

    return jsonResponse(200, {
      ok: true,
      scanned: files.length,
      processed: imageFiles.length,
      inserted,
      updated,
      folder: IMAGEKIT_FOLDER || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(500, { ok: false, error: message })
  }
})
