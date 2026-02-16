import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { hasSupabaseConfig, missingSupabaseKeys, supabase } from './supabase'

type Person = {
  id: number
  name: string
  title: string
  image: string
}

type Score = {
  total: number
  count: number
}

type FaceRow = {
  id: number
  name: string
  title: string | null
  image_url: string
}

type RatingRow = {
  face_id: number
  score: number
}

const RATED_FACE_IDS_STORAGE_KEY = 'rateme_rated_face_ids'

function buildInitialScores(faces: Person[]) {
  return faces.reduce<Record<number, Score>>((acc, person) => {
    acc[person.id] = { total: 0, count: 0 }
    return acc
  }, {})
}

function pickRandomPersonId(people: Person[], excludeId?: number | null) {
  if (people.length === 0) {
    return null
  }

  if (people.length === 1) {
    return people[0].id
  }

  const candidates = excludeId ? people.filter((person) => person.id !== excludeId) : people
  const randomIndex = Math.floor(Math.random() * candidates.length)
  return candidates[randomIndex].id
}

function toPersonRows(rows: FaceRow[]): Person[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title ?? 'Untitled',
    image: row.image_url,
  }))
}

function aggregateScores(faces: Person[], ratings: RatingRow[]) {
  const nextScores = buildInitialScores(faces)

  ratings.forEach((rating) => {
    if (!nextScores[rating.face_id]) {
      return
    }

    nextScores[rating.face_id].total += Number(rating.score) || 0
    nextScores[rating.face_id].count += 1
  })

  return nextScores
}

function loadRatedFaceIds() {
  try {
    const raw = localStorage.getItem(RATED_FACE_IDS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((value): value is number => typeof value === 'number')
  } catch {
    return []
  }
}

function ScoreStar({ filled, index }: { filled: boolean; index: number }) {
  const gradientId = `score-star-gold-${index}`
  const bevelId = `score-star-bevel-${index}`
  const shadowId = `score-star-depth-${index}`

  return (
    <svg className="score-star-icon" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="5%" y1="0%" x2="95%" y2="100%">
          <stop offset="0%" stopColor="#fffce8" />
          <stop offset="24%" stopColor="#fde68a" />
          <stop offset="48%" stopColor="#facc15" />
          <stop offset="78%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={bevelId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.68)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id={shadowId} x="-45%" y="-45%" width="190%" height="190%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="0.75" floodColor="#fff8db" floodOpacity="0.6" />
          <feDropShadow dx="0" dy="2.8" stdDeviation="1.15" floodColor="#92400e" floodOpacity="0.52" />
          <feDropShadow dx="0" dy="6.2" stdDeviation="2.15" floodColor="#b45309" floodOpacity="0.38" />
        </filter>
      </defs>
      {filled ? (
        <>
          <path
            d="M12 3.1l2.8 5.68 6.27.91-4.53 4.41 1.07 6.24L12 17.42l-5.61 2.92 1.08-6.24-4.53-4.41 6.27-.91L12 3.1z"
            fill="#7c2d12"
            opacity="0.62"
            transform="translate(0 0.7)"
          />
          <path
            d="M12 2.35l2.85 5.77 6.37.93-4.61 4.49 1.09 6.35L12 16.9l-5.7 2.99 1.09-6.35L2.78 9.05l6.37-.93L12 2.35z"
            fill={`url(#${gradientId})`}
            stroke="#9a3412"
            strokeWidth="0.85"
            filter={`url(#${shadowId})`}
          />
          <path
            d="M12 3.35l2.46 4.99 5.51.81-3.99 3.88.95 5.48L12 15.95l-4.94 2.56.95-5.48-3.99-3.88 5.51-.81L12 3.35z"
            fill={`url(#${bevelId})`}
          />
          <path
            d="M12 4.2l1.9 3.84 4.24.62-3.07 2.98.73 4.22L12 13.92l-3.8 1.94.73-4.22-3.07-2.98 4.24-.62L12 4.2z"
            fill="rgba(255,255,255,0.19)"
            transform="translate(-0.1 -0.24)"
          />
        </>
      ) : (
        <path
          d="M12 2.35l2.85 5.77 6.37.93-4.61 4.49 1.09 6.35L12 16.9l-5.7 2.99 1.09-6.35L2.78 9.05l6.37-.93L12 2.35z"
          fill="#dee6f1"
          stroke="#afbccf"
          strokeWidth="0.85"
        />
      )}
    </svg>
  )
}

function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [scores, setScores] = useState<Record<number, Score>>({})
  const [hoverStars, setHoverStars] = useState(0)
  const [lastVote, setLastVote] = useState<{ rating: number; personName: string } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [ratedFaceIds, setRatedFaceIds] = useState<number[]>(() => loadRatedFaceIds())

  const ratedFaceIdsSet = useMemo(() => new Set(ratedFaceIds), [ratedFaceIds])
  const unratedPeople = useMemo(
    () => people.filter((person) => !ratedFaceIdsSet.has(person.id)),
    [people, ratedFaceIdsSet],
  )
  const isAllRated = !isLoading && people.length > 0 && unratedPeople.length === 0

  const currentPerson = unratedPeople.find((person) => person.id === currentId) ?? null
  const currentScore = currentPerson ? scores[currentPerson.id] ?? { total: 0, count: 0 } : { total: 0, count: 0 }
  const currentAverage = currentScore.count ? currentScore.total / currentScore.count : 0
  const currentAverageStars = Math.max(0, Math.min(5, Math.round(currentAverage)))

  useEffect(() => {
    localStorage.setItem(RATED_FACE_IDS_STORAGE_KEY, JSON.stringify(ratedFaceIds))
  }, [ratedFaceIds])

  useEffect(() => {
    if (unratedPeople.length === 0) {
      setCurrentId(null)
      return
    }

    if (!currentId || !unratedPeople.some((person) => person.id === currentId)) {
      setCurrentId(pickRandomPersonId(unratedPeople))
    }
  }, [unratedPeople, currentId])

  useEffect(() => {
    if (!supabase || !hasSupabaseConfig) {
      setSyncError(`Supabase 설정 누락: ${missingSupabaseKeys.join(', ')}`)
      setIsLoading(false)
      return
    }
    const client = supabase

    let isCancelled = false

    const refreshFromDb = async () => {
      const [facesResult, ratingsResult] = await Promise.all([
        client.from('faces').select('id,name,title,image_url').eq('status', 'approved'),
        client.from('ratings').select('face_id,score'),
      ])

      if (isCancelled) {
        return
      }

      if (facesResult.error) {
        setSyncError('faces 조회 실패: 테이블/정책을 확인해 주세요.')
        setIsLoading(false)
        return
      }

      if (ratingsResult.error) {
        setSyncError('ratings 조회 실패: 테이블/정책을 확인해 주세요.')
        setIsLoading(false)
        return
      }

      const nextPeople = toPersonRows((facesResult.data ?? []) as FaceRow[])
      const nextScores = aggregateScores(nextPeople, (ratingsResult.data ?? []) as RatingRow[])

      setPeople(nextPeople)
      setScores(nextScores)
      setSyncError(null)
      setIsLoading(false)
    }

    void refreshFromDb()

    const channel = client
      .channel('rateme-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings' },
        () => {
          void refreshFromDb()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'faces' },
        () => {
          void refreshFromDb()
        },
      )
      .subscribe()

    return () => {
      isCancelled = true
      void client.removeChannel(channel)
    }
  }, [])

  const handleRating = async (rating: number) => {
    if (!supabase || !currentPerson) {
      return
    }
    const client = supabase

    const ratedPerson = currentPerson
    const ratedPersonId = currentPerson.id
    const nextPeople = unratedPeople.filter((person) => person.id !== ratedPersonId)

    setScores((prev) => ({
      ...prev,
      [ratedPersonId]: {
        total: (prev[ratedPersonId]?.total ?? 0) + rating,
        count: (prev[ratedPersonId]?.count ?? 0) + 1,
      },
    }))

    setLastVote({ rating, personName: ratedPerson.name })
    setHoverStars(0)
    setRatedFaceIds((prev) => (prev.includes(ratedPersonId) ? prev : [...prev, ratedPersonId]))
    setCurrentId(pickRandomPersonId(nextPeople))

    setPendingWrites((prev) => prev + 1)

    const { error } = await client.from('ratings').insert({
      face_id: ratedPersonId,
      score: rating,
    })

    setPendingWrites((prev) => Math.max(0, prev - 1))

    if (error) {
      setSyncError('점수 저장 실패: ratings INSERT 정책을 확인해 주세요.')
    }
  }

  const syncLabel = !hasSupabaseConfig
    ? '로컬 모드'
    : syncError
      ? '연결 오류'
      : pendingWrites > 0
        ? '저장 중'
        : ''

  return (
    <main className="app-shell">
      <p className="eyebrow">RATEME</p>
      <p className="description">별점을 누르는 순간, 다음 랜덤 사진으로 바로 넘어갑니다. 당신의 점수는 실시간으로 모두에게 공유됩니다.</p>
      {syncLabel && <p className={`sync-status ${syncError ? 'error' : ''}`}>{syncLabel}</p>}

      {isLoading && <p className="sync-error">데이터 불러오는 중...</p>}

      {!isLoading && !currentPerson && !isAllRated && <p className="sync-error">approved 상태의 얼굴 데이터가 없습니다.</p>}

      {isAllRated && (
        <section className="summary">
          <h3>평가 완료</h3>
          <p>현재 등록된 사진을 모두 평가했습니다.</p>
        </section>
      )}

      {currentPerson && (
        <>
          <section className="hero">
            <img src={currentPerson.image} alt={`${currentPerson.name} portrait`} />
            <div className="hero-overlay">
              <p>{currentPerson.title}</p>
              <h2>{currentPerson.name}</h2>
            </div>
          </section>

          <section className="score-box">
            <p className="score-label">현재 점수</p>
            <p className="score-number" aria-label={`현재 평균 ${currentAverage.toFixed(2)}점`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <ScoreStar key={star} index={star} filled={star <= currentAverageStars} />
              ))}
            </p>
            <p className="score-sub">총 {currentScore.count}명 평가</p>

            <div className="stars" onMouseLeave={() => setHoverStars(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${hoverStars >= star ? 'filled' : ''}`}
                  onMouseEnter={() => setHoverStars(star)}
                  onClick={() => {
                    void handleRating(star)
                  }}
                  aria-label={`${star}점 주기`}
                >
                  ★
                </button>
              ))}
            </div>

            <p className="hint">1점~5점 중 하나를 클릭하세요.</p>
          </section>
        </>
      )}

      <section className="summary">
        <p className="last-vote">
          {lastVote ? `최근 평가: ${lastVote.personName} ${lastVote.rating}점` : '아직 평가가 없습니다.'}
        </p>
        {syncError && <p className="sync-error">{syncError}</p>}
      </section>
    </main>
  )
}

export default App
