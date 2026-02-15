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

function App() {
  const [selectedId, setSelectedId] = useState(people[0].id)
  const [scores, setScores] = useState<Record<number, Score>>(initialScores)
  const [hoverStars, setHoverStars] = useState(0)
  const [lastRating, setLastRating] = useState<number | null>(null)

  const selectedPerson = people.find((person) => person.id === selectedId) ?? people[0]
  const selectedScore = scores[selectedId]

  const average = selectedScore.count === 0 ? 0 : selectedScore.total / selectedScore.count

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

  const handleRating = (value: number) => {
    setScores((prev) => ({
      ...prev,
      [selectedId]: {
        total: prev[selectedId].total + value,
        count: prev[selectedId].count + 1,
      },
    }))
    setLastRating(value)
  }

  return (
    <main className="app-shell">
      <section className="panel left-panel">
        <p className="eyebrow">Rateme</p>
        <h1>얼굴을 별점으로 평가해보세요</h1>
        <p className="description">사람을 선택하고 별 1개부터 5개까지 클릭하면 바로 점수가 반영됩니다.</p>

        <div className="gallery">
          {people.map((person) => {
            const personScore = scores[person.id]
            const personAverage = personScore.count === 0 ? '-' : (personScore.total / personScore.count).toFixed(1)

            return (
              <button
                key={person.id}
                className={`face-card ${selectedId === person.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(person.id)
                  setLastRating(null)
                }}
                type="button"
              >
                <img src={person.image} alt={`${person.name} portrait`} loading="lazy" />
                <div className="face-meta">
                  <strong>{person.name}</strong>
                  <span>{person.title}</span>
                  <small>평균 {personAverage} / 5</small>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel right-panel">
        <div className="hero">
          <img src={selectedPerson.image} alt={`${selectedPerson.name} large portrait`} />
          <div className="hero-overlay">
            <p>{selectedPerson.title}</p>
            <h2>{selectedPerson.name}</h2>
          </div>
        </div>

        <div className="score-box">
          <p className="score-label">현재 평균</p>
          <p className="score-number">{average.toFixed(2)}</p>
          <p className="score-sub">총 {selectedScore.count}명 평가</p>

          <div className="stars" onMouseLeave={() => setHoverStars(0)}>
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = (hoverStars || lastRating || 0) >= star

              return (
                <button
                  key={star}
                  type="button"
                  className={`star ${filled ? 'filled' : ''}`}
                  onMouseEnter={() => setHoverStars(star)}
                  onClick={() => handleRating(star)}
                  aria-label={`${star}점 주기`}
                >
                  ★
                </button>
              )
            })}
          </div>

          <p className="hint">별을 누르면 바로 반영됩니다 (1점 ~ 5점).</p>
        </div>

        <div className="summary">
          <h3>전체 누적 통계</h3>
          <p>총 평점 수: {overallStats.count}</p>
          <p>전체 평균: {overallStats.count ? (overallStats.total / overallStats.count).toFixed(2) : '0.00'}</p>
        </div>
      </section>
    </main>
  )
}

export default App
