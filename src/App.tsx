import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
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

const RATED_FACE_IDS_STORAGE_KEY_PREFIX = 'rateme_rated_face_ids'
const REFERENCE_STAR_URL =
  'https://ik.imagekit.io/rat3me/New%20Folder/pngtree-three-dimensional-golden-star-with-sharp-points-and-a-smooth-surface-png-image_16474576.png'

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

function loadRatedFaceIds(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey)
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

function ScoreStar({ fillRatio, index }: { fillRatio: number; index: number }) {
  const clippedRight = Math.round((1 - Math.max(0, Math.min(1, fillRatio))) * 100)
  return (
    <span className="score-star-figure">
      <img className="score-star-icon-image empty" src={REFERENCE_STAR_URL} alt="" loading="lazy" decoding="async" />
      <img
        className="score-star-icon-image filled"
        src={REFERENCE_STAR_URL}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ clipPath: `inset(0 ${clippedRight}% 0 0)` }}
      />
      <span className="sr-only">{`현재 점수 별 ${index}`}</span>
    </span>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [scores, setScores] = useState<Record<number, Score>>({})
  const [hoverStars, setHoverStars] = useState(0)
  const [lastVote, setLastVote] = useState<{ rating: number; personName: string } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [ratedFaceIds, setRatedFaceIds] = useState<number[]>([])

  const ratedFaceIdsStorageKey = useMemo(
    () => `${RATED_FACE_IDS_STORAGE_KEY_PREFIX}_${session?.user.id ?? 'guest'}`,
    [session?.user.id],
  )

  const ratedFaceIdsSet = useMemo(() => new Set(ratedFaceIds), [ratedFaceIds])
  const unratedPeople = useMemo(
    () => people.filter((person) => !ratedFaceIdsSet.has(person.id)),
    [people, ratedFaceIdsSet],
  )
  const isAllRated = !isLoading && people.length > 0 && unratedPeople.length === 0

  const currentPerson = unratedPeople.find((person) => person.id === currentId) ?? null
  const currentScore = currentPerson ? scores[currentPerson.id] ?? { total: 0, count: 0 } : { total: 0, count: 0 }
  const currentAverage = currentScore.count ? currentScore.total / currentScore.count : 0

  useEffect(() => {
    if (!session) {
      setRatedFaceIds([])
      return
    }

    setRatedFaceIds(loadRatedFaceIds(ratedFaceIdsStorageKey))
  }, [session, ratedFaceIdsStorageKey])

  useEffect(() => {
    if (!session) {
      return
    }

    localStorage.setItem(ratedFaceIdsStorageKey, JSON.stringify(ratedFaceIds))
  }, [ratedFaceIds, ratedFaceIdsStorageKey, session])

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
      setIsAuthLoading(false)
      return
    }

    const client = supabase

    const initializeSession = async () => {
      const { data, error } = await client.auth.getSession()

      if (error) {
        setAuthError('세션 조회 실패: 잠시 후 다시 시도해 주세요.')
      } else {
        setSession(data.session)
      }

      setIsAuthLoading(false)
    }

    void initializeSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !hasSupabaseConfig) {
      setSyncError(`Supabase 설정 누락: ${missingSupabaseKeys.join(', ')}`)
      setIsLoading(false)
      return
    }

    if (!session) {
      setIsLoading(false)
      setPeople([])
      setScores({})
      setCurrentId(null)
      setLastVote(null)
      setSyncError(null)
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
  }, [session])

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      return
    }

    setAuthError(null)
    setAuthNotice(null)

    if (!email || !password) {
      setAuthError('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    if (password.length < 6) {
      setAuthError('비밀번호는 6자 이상이어야 합니다.')
      return
    }

    const client = supabase

    if (authMode === 'signup') {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
      })

      if (error) {
        setAuthError(error.message)
        return
      }

      setPassword('')
      if (!data.session) {
        setAuthNotice('회원가입 완료. 이메일 인증 후 로그인해 주세요.')
      } else {
        setAuthNotice('회원가입 및 로그인 완료.')
      }

      return
    }

    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    setPassword('')
  }

  const handleSignOut = async () => {
    if (!supabase) {
      return
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError('로그아웃 실패: 잠시 후 다시 시도해 주세요.')
    }
  }

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

  if (!hasSupabaseConfig) {
    return (
      <main className="app-shell">
        <p className="eyebrow">RATEME</p>
        <p className="sync-error">Supabase 설정 누락: {missingSupabaseKeys.join(', ')}</p>
      </main>
    )
  }

  if (isAuthLoading) {
    return (
      <main className="app-shell">
        <p className="eyebrow">RATEME</p>
        <p className="description">인증 상태 확인 중...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="app-shell auth-shell">
        <p className="eyebrow">RATEME</p>
        <section className="auth-card">
          <h2>{authMode === 'signin' ? '로그인' : '회원가입'}</h2>
          <p className="description">Supabase Auth(email/password) 기반 인증입니다.</p>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
            <button type="submit" className="auth-submit">
              {authMode === 'signin' ? '로그인' : '회원가입'}
            </button>
          </form>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))
              setAuthError(null)
              setAuthNotice(null)
            }}
          >
            {authMode === 'signin' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
          </button>
          {authNotice && <p className="auth-notice">{authNotice}</p>}
          {authError && <p className="sync-error">{authError}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="session-bar">
        <p>로그인: {session.user.email ?? 'unknown'}</p>
        <button type="button" className="signout-button" onClick={() => void handleSignOut()}>
          로그아웃
        </button>
      </section>
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
                <ScoreStar
                  key={star}
                  index={star}
                  fillRatio={Math.max(0, Math.min(1, currentAverage - (star - 1)))}
                />
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
