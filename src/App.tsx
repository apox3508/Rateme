import { useMemo, useState } from 'react'
import './App.css'

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

const initialScores = people.reduce<Record<number, Score>>((acc, person) => {
  acc[person.id] = { total: 0, count: 0 }
  return acc
}, {})

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
  const [scores, setScores] = useState<Record<number, Score>>(initialScores)
  const [hoverStars, setHoverStars] = useState(0)
  const [lastVote, setLastVote] = useState<{ rating: number; personName: string } | null>(null)

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

  const handleRating = (rating: number) => {
    setScores((prev) => ({
      ...prev,
      [currentId]: {
        total: prev[currentId].total + rating,
        count: prev[currentId].count + 1,
      },
    }))

    setLastVote({ rating, personName: currentPerson.name })
    setHoverStars(0)
    setCurrentId(pickRandomPersonId(currentId))
  }

  return (
    <main className="app-shell">
      <p className="eyebrow">Rateme</p>
      <h1>랜덤 얼굴 평가</h1>
      <p className="description">별점을 누르면 바로 다음 랜덤 사진으로 넘어갑니다.</p>

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
              className={`star ${(hoverStars || 0) >= star ? 'filled' : ''}`}
              onMouseEnter={() => setHoverStars(star)}
              onClick={() => handleRating(star)}
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
      </section>
    </main>
  )
}

export default App
