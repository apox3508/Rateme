import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore'
import './App.css'
import { db, hasFirebaseConfig } from './firebase'

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

const people: Person[] = [
  {
    id: 1,
    name: 'Alex',
    title: 'Street Portrait',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 2,
    name: 'Mina',
    title: 'Studio Light',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 3,
    name: 'Noah',
    title: 'Casual Mood',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80',
  },
]

function buildInitialScores() {
  return people.reduce<Record<number, Score>>((acc, person) => {
    acc[person.id] = { total: 0, count: 0 }
    return acc
  }, {})
}

function pickRandomPersonId(excludeId?: number) {
  if (people.length === 1) {
    return people[0].id
  }

  const candidates = excludeId ? people.filter((person) => person.id !== excludeId) : people
  const randomIndex = Math.floor(Math.random() * candidates.length)
  return candidates[randomIndex].id
}

function App() {
  const [currentId, setCurrentId] = useState(() => pickRandomPersonId())
  const [scores, setScores] = useState<Record<number, Score>>(() => buildInitialScores())
  const [hoverStars, setHoverStars] = useState(0)
  const [lastVote, setLastVote] = useState<{ rating: number; personName: string } | null>(null)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)

  const currentPerson = people.find((person) => person.id === currentId) ?? people[0]
  const currentScore = scores[currentId]

  const currentAverage = currentScore.count ? currentScore.total / currentScore.count : 0

  const overallStats = useMemo(() => {
    return Object.values(scores).reduce(
      (acc, current) => {
        acc.total += current.total
        acc.count += current.count
        return acc
      },
      { total: 0, count: 0 },
    )
  }, [scores])

  useEffect(() => {
    if (!db || !hasFirebaseConfig) {
      setSyncError('공유 모드가 비활성화됨: Firebase 환경변수를 설정하면 모두가 같은 점수를 보게 됩니다.')
      return
    }
    const firestore = db

    const unsubscribe = onSnapshot(
      collection(firestore, 'ratings'),
      (snapshot) => {
        const nextScores = buildInitialScores()

        snapshot.forEach((entry) => {
          const personId = Number(entry.id)
          const data = entry.data() as { total?: unknown; count?: unknown }

          if (!Number.isFinite(personId) || !nextScores[personId]) {
            return
          }

          nextScores[personId] = {
            total: Number(data.total) || 0,
            count: Number(data.count) || 0,
          }
        })

        setScores(nextScores)
        setSyncError(null)
      },
      () => {
        setSyncError('공유 점수를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      },
    )

    return () => unsubscribe()
  }, [])

  const handleRating = async (rating: number) => {
    const ratedPersonId = currentId
    const ratedPerson = currentPerson

    setLastVote({ rating, personName: ratedPerson.name })
    setHoverStars(0)
    setCurrentId(pickRandomPersonId(ratedPersonId))

    if (!db || !hasFirebaseConfig) {
      setScores((prev) => ({
        ...prev,
        [ratedPersonId]: {
          total: prev[ratedPersonId].total + rating,
          count: prev[ratedPersonId].count + 1,
        },
      }))
      return
    }
    const firestore = db

    setPendingWrites((prev) => prev + 1)

    try {
      await runTransaction(firestore, async (transaction) => {
        const ratingRef = doc(firestore, 'ratings', String(ratedPersonId))
        const ratingDoc = await transaction.get(ratingRef)
        const data = ratingDoc.data() as { total?: unknown; count?: unknown } | undefined

        const previousTotal = Number(data?.total) || 0
        const previousCount = Number(data?.count) || 0

        transaction.set(
          ratingRef,
          {
            name: ratedPerson.name,
            title: ratedPerson.title,
            total: previousTotal + rating,
            count: previousCount + 1,
          },
          { merge: true },
        )
      })
    } catch {
      setSyncError('점수 저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
    } finally {
      setPendingWrites((prev) => Math.max(0, prev - 1))
    }
  }

  const syncLabel = !hasFirebaseConfig
    ? '로컬 모드'
    : syncError
      ? '연결 오류'
      : pendingWrites > 0
        ? '저장 중'
        : '공유 모드'

  return (
    <main className="app-shell">
      <p className="eyebrow">Rateme</p>
      <h1>랜덤 얼굴 평가</h1>
      <p className="description">별점을 누르면 다음 랜덤 사진으로 넘어가고, 점수는 모두와 공유됩니다.</p>
      <p className={`sync-status ${syncError ? 'error' : ''}`}>{syncLabel}</p>

      <section className="hero">
        <img src={currentPerson.image} alt={`${currentPerson.name} portrait`} />
        <div className="hero-overlay">
          <p>{currentPerson.title}</p>
          <h2>{currentPerson.name}</h2>
        </div>
      </section>

      <section className="score-box">
        <p className="score-label">현재 인물 평균</p>
        <p className="score-number">{currentAverage.toFixed(2)}</p>
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

      <section className="summary">
        <h3>전체 누적 통계</h3>
        <p>총 평점 수: {overallStats.count}</p>
        <p>전체 평균: {overallStats.count ? (overallStats.total / overallStats.count).toFixed(2) : '0.00'}</p>
        <p className="last-vote">
          {lastVote ? `최근 평가: ${lastVote.personName} ${lastVote.rating}점` : '아직 평가가 없습니다.'}
        </p>
        {syncError && <p className="sync-error">{syncError}</p>}
      </section>
    </main>
  )
}

export default App
