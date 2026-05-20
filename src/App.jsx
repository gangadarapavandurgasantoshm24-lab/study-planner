import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, firebaseReady } from './firebase'

const defaultSchedule = [
  { time: '7:00 AM - 8:00 AM', task: 'Exercise', category: 'Health', status: 'pending' },
  { time: '8:00 AM - 9:00 AM', task: 'Bath & Breakfast', category: 'Routine', status: 'pending' },
  { time: '9:00 AM - 10:30 AM', task: 'DSA Practice', category: 'Study', status: 'pending' },
  { time: '10:30 AM - 12:00 PM', task: 'Full Stack Development', category: 'Study', status: 'pending' },
  { time: '12:00 PM - 1:00 PM', task: 'Lunch', category: 'Break', status: 'pending' },
  { time: '1:00 PM - 3:30 PM', task: 'Relax / Sleep', category: 'Rest', status: 'pending' },
  { time: '4:00 PM - 5:30 PM', task: 'Play / Work', category: 'Activity', status: 'pending' },
  { time: '5:30 PM - 7:00 PM', task: 'Outdoor Activity', category: 'Activity', status: 'pending' },
  { time: '7:00 PM - 8:00 PM', task: 'Dinner & Regular Things', category: 'Routine', status: 'pending' },
  { time: '8:00 PM - 9:30 PM', task: 'Projects', category: 'Focus', status: 'pending' },
  { time: '9:30 PM - 11:00 PM', task: 'DSA Revision', category: 'Focus', status: 'pending' },
]

const quotes = [
  'Discipline beats motivation.',
  'Small progress every day becomes success.',
  'Focus on consistency, not perfection.',
  'Your future is built today.',
  'Stay strong. Stay focused.',
]

const categoryStyles = {
  Health: 'bg-emerald-500/15 border-emerald-400/70',
  Routine: 'bg-sky-500/15 border-sky-400/70',
  Study: 'bg-violet-500/15 border-violet-400/70',
  Break: 'bg-amber-500/15 border-amber-400/70',
  Rest: 'bg-rose-500/15 border-rose-400/70',
  Activity: 'bg-orange-500/15 border-orange-400/70',
  Focus: 'bg-cyan-500/15 border-cyan-400/70',
}

const makeDays = () =>
  Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    completed: false,
    notes: '',
    progress: 0,
    warning: false,
    schedule: defaultSchedule.map((item) => ({ ...item })),
  }))

const readStorage = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [days, setDays] = useState(() => readStorage('study-timetable', makeDays()))
  const [selectedDay, setSelectedDay] = useState(1)
  const [darkMode, setDarkMode] = useState(() => readStorage('study-dark-mode', true))
  const [timer, setTimer] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [xp, setXp] = useState(() => readStorage('study-xp', 0))
  const [streak, setStreak] = useState(() => readStorage('study-streak', 0))
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [authMessage, setAuthMessage] = useState(
    firebaseReady ? 'Local save is active. Login to enable cloud sync.' : 'Add Firebase keys to enable login and cloud sync.',
  )
  const cloudLoadedRef = useRef(false)
  const cloudPayloadRef = useRef(null)

  const completedCount = days.filter((day) => day.completed).length
  const totalTasks = days.flatMap((day) => day.schedule).length
  const completedTasks = days.flatMap((day) => day.schedule).filter((task) => task.status === 'done').length
  const taskProgress = Math.round((completedTasks / totalTasks) * 100)
  const progress = Math.round((completedCount / 30) * 100)
  const currentDayData = days.find((day) => day.day === selectedDay) || days[0]
  const doneCountToday = currentDayData.schedule.filter((task) => task.status === 'done').length
  const skippedCountToday = currentDayData.schedule.filter((task) => task.status === 'skipped').length
  const todayProgress = Math.round((doneCountToday / currentDayData.schedule.length) * 100)

  const cloudPayload = useMemo(
    () => ({
      days,
      xp,
      streak,
      updatedAt: new Date().toISOString(),
    }),
    [days, xp, streak],
  )

  useEffect(() => {
    cloudPayloadRef.current = cloudPayload
  }, [cloudPayload])

  useEffect(() => {
    localStorage.setItem('study-timetable', JSON.stringify(days))
    localStorage.setItem('study-xp', JSON.stringify(xp))
    localStorage.setItem('study-streak', JSON.stringify(streak))
    localStorage.setItem('study-dark-mode', JSON.stringify(darkMode))
  }, [days, xp, streak, darkMode])

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % quotes.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isRunning) return undefined

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setIsRunning(false)
          window.alert('Pomodoro Session Completed!')
          return 0
        }

        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning])

  useEffect(() => {
    if (!firebaseReady || !auth) return undefined

    return onAuthStateChanged(auth, async (activeUser) => {
      setUser(activeUser)
      cloudLoadedRef.current = false

      if (!activeUser || !db) {
        setAuthMessage(firebaseReady ? 'Local save is active. Login to enable cloud sync.' : 'Add Firebase keys to enable login and cloud sync.')
        return
      }

      const plannerRef = doc(db, 'studyPlanners', activeUser.uid)
      const snapshot = await getDoc(plannerRef)

      if (snapshot.exists()) {
        const data = snapshot.data()
        setDays(data.days || makeDays())
        setXp(data.xp || 0)
        setStreak(data.streak || 0)
        setAuthMessage(`Synced as ${activeUser.email}`)
      } else {
        await setDoc(plannerRef, cloudPayloadRef.current)
        setAuthMessage(`Cloud save created for ${activeUser.email}`)
      }

      cloudLoadedRef.current = true
    })
  }, [])

  useEffect(() => {
    if (!firebaseReady || !user || !db || !cloudLoadedRef.current) return undefined

    const timeout = setTimeout(async () => {
      await setDoc(doc(db, 'studyPlanners', user.uid), cloudPayload, { merge: true })
      setAuthMessage(`Synced as ${user.email}`)
    }, 700)

    return () => clearTimeout(timeout)
  }, [cloudPayload, user])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const handleAuth = async (event) => {
    event.preventDefault()

    if (!firebaseReady || !auth) {
      setAuthMessage('Firebase is not configured yet. Add your keys in a .env file first.')
      return
    }

    if (!email || password.length < 6) {
      setAuthMessage('Enter an email and a password with at least 6 characters.')
      return
    }

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      await createUserWithEmailAndPassword(auth, email, password)
    }
  }

  const toggleDay = (dayNumber) => {
    const targetDay = days.find((day) => day.day === dayNumber)

    if (targetDay && !targetDay.completed) {
      setXp((prev) => prev + 50)
      setStreak((prev) => prev + 1)
    }

    setDays((prev) =>
      prev.map((day) => (day.day === dayNumber ? { ...day, completed: !day.completed, progress: day.completed ? day.progress : Math.max(day.progress || 0, 100) } : day)),
    )
  }

  const updateNotes = (value) => {
    setDays((prev) => prev.map((day) => (day.day === selectedDay ? { ...day, notes: value } : day)))
  }

  const updateTaskName = (taskIndex, taskName) => {
    setDays((prev) =>
      prev.map((day) => {
        if (day.day !== selectedDay) return day

        const updatedSchedule = day.schedule.map((task, index) =>
          index === taskIndex
            ? {
                ...task,
                task: taskName,
                updatedAt: new Date().toLocaleString(),
              }
            : task,
        )

        return {
          ...day,
          schedule: updatedSchedule,
          lastUpdated: new Date().toLocaleString(),
        }
      }),
    )
  }

  const updateTaskStatus = (taskIndex, status) => {
    setDays((prev) =>
      prev.map((day) => {
        if (day.day !== selectedDay) return day

        const updatedSchedule = day.schedule.map((task, index) =>
          index === taskIndex
            ? {
                ...task,
                status,
                updatedAt: new Date().toLocaleString(),
              }
            : task,
        )

        const doneTasks = updatedSchedule.filter((task) => task.status === 'done').length
        const skippedTasks = updatedSchedule.filter((task) => task.status === 'skipped').length
        const nextProgress = Math.round((doneTasks / updatedSchedule.length) * 100)

        return {
          ...day,
          completed: doneTasks >= 8,
          warning: skippedTasks >= 2,
          progress: nextProgress,
          schedule: updatedSchedule,
          lastUpdated: new Date().toLocaleString(),
        }
      }),
    )
  }

  const handleSignOut = async () => {
    if (auth) await signOut(auth)
  }

  return (
    <main className={`${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-950'} min-h-screen transition-colors duration-500`}>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className={`${darkMode ? 'bg-slate-900/80 border-cyan-400/20' : 'bg-white border-slate-200'} mb-6 rounded-lg border p-4 shadow-xl`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-cyan-300">🔐 Study Planner Account</h2>
              <p className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{authMessage}</p>
            </div>

            {user ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className="rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 font-bold text-emerald-300">{user.email}</span>
                <button onClick={handleSignOut} className="rounded-lg bg-slate-700 px-5 py-3 font-bold text-white transition hover:bg-slate-600">
                  Logout
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuth} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  className="min-w-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="min-w-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
                <button className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400">Login / Signup</button>
              </form>
            )}
          </div>
        </section>

        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-normal text-cyan-300 sm:text-5xl">30 DAY STUDY TIMETABLE</h1>
            <p className={`mt-2 text-lg ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{quotes[quoteIndex]}</p>
          </div>

          <button onClick={() => setDarkMode(!darkMode)} className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 sm:w-auto">
            {darkMode ? '☀ Light Mode' : '🌙 Dark Mode'}
          </button>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard darkMode={darkMode} title="🔥 Streak" value={streak} label="Days completed continuously" color="text-orange-400" />
          <StatCard darkMode={darkMode} title="⭐ XP Points" value={xp} label="Earn XP by completing study days" color="text-cyan-400" />
          <div className={`${darkMode ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200'} rounded-lg border p-5 shadow-xl`}>
            <h3 className="mb-3 text-2xl font-bold">⏳ Pomodoro Timer</h3>
            <div className="mb-4 text-5xl font-black text-violet-400">{formatTime(timer)}</div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setIsRunning(!isRunning)} className="rounded-lg bg-emerald-500 py-2 font-bold text-slate-950 transition hover:bg-emerald-400">
                {isRunning ? 'Pause' : 'Start'}
              </button>
              <button
                onClick={() => {
                  setTimer(25 * 60)
                  setIsRunning(false)
                }}
                className="rounded-lg bg-rose-500 py-2 font-bold text-white transition hover:bg-rose-400"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <aside className={`${darkMode ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200'} rounded-lg border p-5 shadow-xl`}>
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Progress</h2>
                <span className="text-xl font-bold text-cyan-300">{progress}%</span>
              </div>
              <ProgressBar value={progress} />
              <p className={`mt-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Completed: {completedCount} / 30 Days</p>
            </div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {days.map((day) => (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(day.day)}
                  className={`relative h-12 rounded-lg font-bold transition hover:scale-105 ${
                    selectedDay === day.day ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30' : day.completed ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
                >
                  {day.day}
                  {day.completed && <span className="absolute right-1 top-1 text-xs">✅</span>}
                </button>
              ))}
            </div>
          </aside>

          <section className={`${darkMode ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200'} rounded-lg border p-5 shadow-xl lg:col-span-2`}>
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-4xl font-black text-cyan-300">DAY {selectedDay}</h2>
                  <p className={darkMode ? 'mt-1 text-slate-300' : 'mt-1 text-slate-600'}>Stay disciplined and complete every session.</p>
                </div>

                <button
                  onClick={() => toggleDay(selectedDay)}
                  className={`rounded-lg px-6 py-3 font-bold transition hover:scale-105 ${
                    currentDayData.completed ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-rose-500 text-white hover:bg-rose-400'
                  }`}
                >
                  {currentDayData.completed ? '✅ Marked Done' : '❌ Mark as Done'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStat color="green" label={`${doneCountToday} Done`} />
                <MiniStat color="yellow" label={`${skippedCountToday} Skipped`} />
                <MiniStat color="cyan" label={`${todayProgress}% Today`} />
              </div>
            </div>

            <div className="space-y-4">
              {currentDayData.schedule.map((item, index) => (
                <div key={`${item.task}-${index}`} className={`rounded-lg border p-4 transition hover:scale-[1.01] ${categoryStyles[item.category]}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className={darkMode ? 'text-sm font-semibold text-slate-300' : 'text-sm font-semibold text-slate-600'}>{item.time}</p>
                      <input
                        value={item.task}
                        onChange={(event) => updateTaskName(index, event.target.value)}
                        aria-label={`Task name for ${item.time}`}
                        className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-xl font-bold outline-none transition focus:border-cyan-400 focus:bg-slate-950/50 focus:px-3"
                      />
                      <p className="mt-1 text-sm opacity-80">Category: {item.category}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                      <TaskButton active={item.status === 'done'} activeClass="bg-emerald-500 text-slate-950" onClick={() => updateTaskStatus(index, 'done')}>
                        ✅ Done
                      </TaskButton>
                      <TaskButton active={item.status === 'undone'} activeClass="bg-rose-500 text-white" onClick={() => updateTaskStatus(index, 'undone')}>
                        ❌ Undone
                      </TaskButton>
                      <TaskButton active={item.status === 'skipped'} activeClass="bg-amber-400 text-slate-950" onClick={() => updateTaskStatus(index, 'skipped')}>
                        ⏭ Skipped
                      </TaskButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="rounded-lg border border-cyan-500/30 bg-slate-950/60 p-5">
                <h3 className="mb-4 text-2xl font-bold text-cyan-300">📊 Overall Task Progress</h3>
                <ProgressBar value={taskProgress} />
                <p className="mt-4 text-4xl font-black text-emerald-400">{taskProgress}%</p>
                <p className="mt-2 text-slate-300">Completed Tasks: {completedTasks} / {totalTasks}</p>
              </div>

              <div className="rounded-lg border border-violet-500/30 bg-slate-950/60 p-5">
                <h3 className="mb-4 text-2xl font-bold text-violet-300">📈 Analytics</h3>
                <div className="space-y-4">
                  {currentDayData.schedule.map((task, taskIndex) => {
                    const taskDone = days.filter((day) => day.schedule[taskIndex]?.status === 'done').length
                    const percent = Math.round((taskDone / 30) * 100)

                    return (
                      <div key={`${task.time}-${taskIndex}`}>
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <span className="truncate">{task.task}</span>
                          <span>{percent}%</span>
                        </div>
                        <ProgressBar value={percent} small />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={`${darkMode ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200'} rounded-lg border p-5 shadow-xl`}>
            <h3 className="mb-4 text-2xl font-bold text-emerald-300">📅 Saved Day Progress</h3>
            <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
              {days.map((day) => (
                <div key={day.day} className={`rounded-lg border p-4 ${day.completed ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/60 text-white'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-lg font-bold">Day {day.day}</h4>
                      <p className="text-sm text-slate-300">Progress: {day.progress || 0}%</p>
                      {day.lastUpdated && <p className="mt-1 text-xs text-slate-400">Updated: {day.lastUpdated}</p>}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {day.warning && <div className="rounded-lg bg-amber-400 px-3 py-1 text-sm font-bold text-slate-950">Warning</div>}
                      {day.completed && <div className="rounded-lg bg-emerald-500 px-3 py-1 text-sm font-bold text-slate-950">Completed</div>}
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={day.progress || 0} small />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${darkMode ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200'} rounded-lg border p-5 shadow-xl`}>
            <h3 className="mb-3 text-2xl font-bold text-violet-300">Daily Notes</h3>
            <textarea
              value={currentDayData.notes}
              onChange={(event) => updateNotes(event.target.value)}
              placeholder="Write what you completed today, problems solved, project updates, goals for tomorrow..."
              className="h-52 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/80 p-4 text-white outline-none transition focus:border-cyan-400"
            />
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <FocusCard title="Morning Focus" text="Start your day with energy, exercise, and focused coding practice." border="border-cyan-400/30" />
          <FocusCard title="Deep Work" text="Build strong DSA and Full Stack skills through consistency." border="border-violet-400/30" />
          <FocusCard title="Night Grind" text="Projects and problem solving at night will level up your career." border="border-rose-400/30" />
        </section>
      </div>
    </main>
  )
}

function StatCard({ darkMode, title, value, label, color }) {
  return (
    <div className={`${darkMode ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200'} rounded-lg border p-5 shadow-xl`}>
      <h3 className="mb-2 text-2xl font-bold">{title}</h3>
      <p className={`text-5xl font-black ${color}`}>{value}</p>
      <p className={darkMode ? 'mt-2 text-slate-300' : 'mt-2 text-slate-600'}>{label}</p>
    </div>
  )
}

function MiniStat({ color, label }) {
  const styles = {
    green: 'border-emerald-400 bg-emerald-500/15 text-emerald-300',
    yellow: 'border-amber-400 bg-amber-500/15 text-amber-300',
    cyan: 'border-cyan-400 bg-cyan-500/15 text-cyan-300',
  }

  return <div className={`rounded-lg border px-4 py-2 text-center font-bold ${styles[color]}`}>{label}</div>
}

function ProgressBar({ value, small = false }) {
  return (
    <div className={`${small ? 'h-3' : 'h-5'} w-full overflow-hidden rounded-full bg-slate-700`}>
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-500 transition-all duration-700" style={{ width: `${value}%` }} />
    </div>
  )
}

function TaskButton({ active, activeClass, onClick, children }) {
  return (
    <button onClick={onClick} className={`min-h-10 rounded-lg px-3 py-2 text-sm font-bold transition hover:scale-105 sm:px-4 ${active ? activeClass : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
      {children}
    </button>
  )
}

function FocusCard({ title, text, border }) {
  return (
    <div className={`rounded-lg border ${border} bg-slate-900/70 p-5 text-white shadow-xl`}>
      <h3 className="mb-2 text-2xl font-bold">{title}</h3>
      <p className="text-slate-300">{text}</p>
    </div>
  )
}

export default App
