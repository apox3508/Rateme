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

function canonicalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '')
}

function isLikelyMediaWork(summary: string) {
  const lower = summary.toLowerCase()
  const mediaMarkers = [
    'album',
    'song',
    'single',
    'film',
    'television series',
    'tv series',
    'soundtrack',
    'novel',
    'video game',
    'episode',
    'disambiguation',
    '앨범',
    '노래',
    '싱글',
    '영화',
    '드라마',
    '사운드트랙',
    '소설',
    '게임',
    '동음이의',
  ]
  return mediaMarkers.some((marker) => lower.includes(marker))
}

function extractOccupation(summary: string) {
  const lower = summary.toLowerCase()
  if (isLikelyMediaWork(summary)) return null
  const pairs: Array<[string, string]> = [
    ['singer-songwriter', 'Singer'],
    ['singer', 'Singer'],
    ['actor', 'Actor'],
    ['actress', 'Actor'],
    ['rapper', 'Rapper'],
    ['model', 'Model'],
    ['producer', 'Producer'],
    ['songwriter', 'Songwriter'],
    ['composer', 'Composer'],
    ['dancer', 'Dancer'],
    ['comedian', 'Comedian'],
    ['politician', 'Politician'],
    ['athlete', 'Athlete'],
    ['footballer', 'Footballer'],
    ['musician', 'Musician'],
    ['가수', 'Singer'],
    ['배우', 'Actor'],
    ['래퍼', 'Rapper'],
    ['모델', 'Model'],
    ['프로듀서', 'Producer'],
    ['작곡가', 'Composer'],
    ['댄서', 'Dancer'],
    ['코미디언', 'Comedian'],
    ['정치인', 'Politician'],
    ['운동선수', 'Athlete'],
    ['축구선수', 'Footballer'],
    ['뮤지션', 'Musician'],
  ]

  for (const [needle, title] of pairs) {
    if (lower.includes(needle)) return title
  }
  return null
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
    searchUrl.searchParams.set('limit', '5')
    searchUrl.searchParams.set('namespace', '0')
    searchUrl.searchParams.set('format', 'json')

    const searchRes = await fetch(searchUrl)
    if (!searchRes.ok) continue

    const searchJson = (await searchRes.json()) as [string, string[]]
    const titles = searchJson?.[1] ?? []
    const directTitle = decodeURIComponent(name).replace(/\.[^/.]+$/, '').trim()
    const candidates = Array.from(new Set([directTitle, ...titles])).filter(Boolean)
    const canonicalName = canonicalizeName(name)
    const ranked = candidates
      .map((title) => {
        let score = 0
        if (canonicalizeName(title) === canonicalName) score += 100
        if (!title.includes('(')) score += 10
        if (title.toLowerCase().includes('disambiguation')) score -= 50
        return { title, score }
      })
      .sort((a, b) => b.score - a.score)

    for (const candidate of ranked) {
      const summaryRes = await fetch(`${target.summaryBase}${encodeURIComponent(candidate.title)}`)
      if (!summaryRes.ok) continue

      const summaryJson = (await summaryRes.json()) as { extract?: string; description?: string; title?: string }
      const summary = summaryJson.description ?? summaryJson.extract
      if (!summary) continue

      const occupation = extractOccupation(summary)
      if (occupation) return occupation
    }
  }

  return 'Public Figure'
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
