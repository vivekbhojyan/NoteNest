import React, { useEffect, useState } from 'react'
import './App.css'

type ResourceType = 'Syllabus' | 'Sessional papers' | 'Previous papers' | 'Notes'

type Unit = {
  unitId: number
  title: string
  topics: string[]
}

type Subject = {
  _id?: string
  name: string
  code: string
  course: string
  year: string
  branch: string
  units: Unit[]
}

type NoteItem = {
  _id: string
  title: string
  ownerEmail: string
  rating: number
  readability: number
  handwriting: number
  clarity: number
  coverage: number
  explanation: string
  createdAt: string
}

type PaperItem = {
  _id: string
  title: string
  type: string
  createdAt: string
}

type Profile = {
  course?: string
  academicYear?: string
  branch?: string
}

const coursesWithBranches = new Set(['B.Tech', 'M.Tech'])

export default function App() {
  const [screen, setScreen] = useState<'login' | 'profile' | 'catalog' | 'unit' | 'admin'>('login')
  const [email, setEmail] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [course, setCourse] = useState('')
  const [year, setYear] = useState('')
  const [branch, setBranch] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [tab, setTab] = useState<ResourceType>('Notes')

  const [unlocked, setUnlocked] = useState(false)
  const [userRole, setUserRole] = useState<'student' | 'admin'>('student')
  const [admin, setAdmin] = useState(false)
  const [toast, setToast] = useState('')

  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4500)
  }

  const applyProfile = (profile: Profile) => {
    setCourse(profile.course ?? '')
    setYear(profile.academicYear ?? '')
    setBranch(profile.branch ?? '')
  }

  const validEmail = email.trim().toLowerCase().endsWith('@abes.ac.in')
  const firstName = email.split('@')[0].split('.')[0]
  const welcomeName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : 'Student'

  const requestOtp = async () => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await fetch(`${apiUrl}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not send OTP.')
      setOtpSent(true)
      showToast('OTP sent to your email.')
    } catch (err: any) {
      setAuthError(err.message)
    } finally {
      setAuthBusy(false)
    }
  }

  const verifyOtp = async () => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await fetch(`${apiUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Verification failed.')

      localStorage.setItem('abes_token', body.token)
      setUnlocked(body.user.notesUnlocked)
      setUserRole(body.user.role)
      applyProfile(body.user)

      // Always load the latest saved profile before showing the editable form.
      const profileRes = await fetch(`${apiUrl}/api/profile`, {
        headers: { Authorization: `Bearer ${body.token}` }
      })
      if (profileRes.ok) applyProfile(await profileRes.json())

      setScreen('profile')
    } catch (err: any) {
      setAuthError(err.message)
    } finally {
      setAuthBusy(false)
    }
  }

  useEffect(() => {
    if ((screen === 'catalog' || screen === 'unit') && course && year && branch) {
      const token = localStorage.getItem('abes_token')
      fetch(`${apiUrl}/api/subjects?course=${encodeURIComponent(course)}&year=${encodeURIComponent(year)}&branch=${encodeURIComponent(branch)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setSubjects(data)
        })
        .catch(() => showToast('Failed to load subjects.'))
    }
  }, [apiUrl, branch, course, screen, year])

  const selectUnit = (subject: Subject, unit: Unit) => {
    setSelectedSubject(subject)
    setSelectedUnit(unit)
    setScreen('unit')
    setTab('Notes')
  }

  const openBase64Pdf = (base64: string) => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i)
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
  })

  if (screen === 'login') {
    return (
      <main className="auth-page">
        <section className="auth-copy">
          <div className="mark">a.</div>
          <p className="eyebrow">ABES ENGINEERING COLLEGE</p>
          <h1>Learn together.<br /><em>Grow together.</em></h1>
          <p>Your verified academic resource hub — exclusively for ABES students.</p>
          <div className="trust">
            <span>✓ College email only</span>
            <span>✓ AI Vision verified notes</span>
            <span>✓ Free academic access</span>
          </div>
        </section>

        <section className="auth-card">
          <div className="mobile-mark">a.</div>
          <h2>Student Portal</h2>
          <p>Sign in with your college email.</p>
          <label>
            Email Address
            <input type="email" placeholder="name@abes.ac.in" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          {otpSent && (
            <label>
              One-Time Password (OTP)
              <input inputMode="numeric" maxLength={6} placeholder="Enter 6-digit OTP" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} />
            </label>
          )}
          <button className="primary" disabled={!validEmail || authBusy || (otpSent && otp.length !== 6)} onClick={otpSent ? verifyOtp : requestOtp}>
            {authBusy ? 'Processing...' : otpSent ? 'Verify & Continue' : 'Send OTP'}
          </button>
          {authError && <small className="auth-error" style={{ color: 'red', marginTop: 10, display: 'block' }}>{authError}</small>}
          {otpSent && <small className="hint">OTP expires in 10 minutes.</small>}
          <p className="legal">By logging in, you agree to upload genuine notes to help your peer group.</p>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header>
        <button className="brand" onClick={() => setScreen('catalog')}>
          <b>a.</b> ABES <span>Academic Hub</span>
        </button>
        <div className="header-actions">
          <span className="welcome">Welcome, {welcomeName}</span>
          {userRole === 'admin' && (
            <button className={admin ? 'admin active' : 'admin'} onClick={() => {
              setAdmin(!admin)
              setScreen(admin ? 'catalog' : 'admin')
            }}>
              ⌘ Admin Portal
            </button>
          )}
          <div className="avatar">{email.substring(0, 2).toUpperCase()}</div>
        </div>
      </header>

      {toast && <div className="toast">✓ {toast}</div>}

      {screen === 'profile' ? (
        <ProfileSetup
          course={course}
          year={year}
          branch={branch}
          apiUrl={apiUrl}
          onSaved={profile => {
            applyProfile(profile)
            setScreen('catalog')
          }}
          showToast={showToast}
        />
      ) : screen === 'admin' ? (
        <AdminPortal onBack={() => setScreen('catalog')} showToast={showToast} apiUrl={apiUrl} />
      ) : screen === 'catalog' ? (
        <Catalog
          course={course}
          year={year}
          branch={branch}
          setYear={setYear}
          setBranch={setBranch}
          subjects={subjects}
          onSelect={selectUnit}
        />
      ) : (
        selectedSubject && selectedUnit && (
          <UnitPage
            subject={selectedSubject}
            unit={selectedUnit}
            tab={tab}
            setTab={setTab}
            unlocked={unlocked}
            setUnlocked={setUnlocked}
            showToast={showToast}
            onBack={() => setScreen('catalog')}
            apiUrl={apiUrl}
            fileToBase64={fileToBase64}
            openBase64Pdf={openBase64Pdf}
          />
        )
      )}
    </div>
  )
}

function ProfileSetup({ course: initialCourse, year: initialYear, branch: initialBranch, apiUrl, onSaved, showToast }: any) {
  const [course, setCourse] = useState(initialCourse)
  const [year, setYear] = useState(initialYear)
  const [branch, setBranch] = useState(initialBranch)
  const [saving, setSaving] = useState(false)
  const needsBranch = coursesWithBranches.has(course)

  useEffect(() => {
    setCourse(initialCourse)
    setYear(initialYear)
    setBranch(initialBranch)
  }, [initialBranch, initialCourse, initialYear])

  const saveProfile = async () => {
    if (!course || !year || (needsBranch && !branch)) {
      showToast('Please choose all required academic details.')
      return
    }

    setSaving(true)
    try {
      const token = localStorage.getItem('abes_token')
      const finalBranch = needsBranch ? branch : course
      const res = await fetch(`${apiUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ course, academicYear: year, branch: finalBranch })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save profile.')
      onSaved(data.user ?? { course, academicYear: year, branch: finalBranch })
    } catch (error: any) {
      showToast(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="content">
      <p className="eyebrow green">YOUR ACADEMIC PROFILE</p>
      <h1>{initialCourse ? 'Confirm or update your profile' : 'Set up your profile'}</h1>
      <p className="lead">These details are saved and will be filled automatically the next time you sign in.</p>

      <section className="panel" style={{ maxWidth: 620 }}>
        <label>
          Course
          <select value={course} onChange={e => {
            const nextCourse = e.target.value
            setCourse(nextCourse)
            if (!coursesWithBranches.has(nextCourse)) setBranch(nextCourse)
          }}>
            <option value="">Select course</option>
            <option>B.Tech</option>
            <option>M.Tech</option>
            <option>BCA</option>
            <option>MCA</option>
            <option>MBA</option>
          </select>
        </label>

        <label>
          Academic Year
          <select value={year} onChange={e => setYear(e.target.value)}>
            <option value="">Select academic year</option>
            <option>1st Year</option>
            <option>2nd Year</option>
            <option>3rd Year</option>
            <option>4th Year</option>
          </select>
        </label>

        {needsBranch && (
          <label>
            Branch
            <select value={branch} onChange={e => setBranch(e.target.value)}>
              <option value="">Select branch</option>
              <option>Computer Science & Engineering</option>
              <option>Information Technology</option>
              <option>Electronics & Communication</option>
              <option>Electrical & Electronics Engineering</option>
              <option>Mechanical Engineering</option>
              <option>Civil Engineering</option>
            </select>
          </label>
        )}

        <button className="primary" disabled={saving} onClick={saveProfile}>
          {saving ? 'Saving...' : 'Continue →'}
        </button>
      </section>
    </main>
  )
}

function Catalog({ course, year, branch, setYear, setBranch, subjects, onSelect }: any) {
  return (
    <main className="content">
      <p className="eyebrow green">YOUR ACADEMIC HUB</p>
      <h1>{course ? `${course} · ${year}` : 'Select Your Course.'}</h1>
      <p className="lead">Find units, syllabus guidelines, previous papers, and community notes.</p>

      <div className="filters">
        <label>
          Academic Year
          <select value={year} onChange={e => setYear(e.target.value)}>
            <option>1st Year</option>
            <option>2nd Year</option>
            <option>3rd Year</option>
            <option>4th Year</option>
          </select>
        </label>
        {coursesWithBranches.has(course) ? (
          <label>
            Engineering Branch
            <select value={branch} onChange={e => setBranch(e.target.value)}>
              <option>Computer Science & Engineering</option>
              <option>Information Technology</option>
              <option>Electronics & Communication</option>
              <option>Mechanical Engineering</option>
            </select>
          </label>
        ) : (
          <label>
            Course
            <input value={course} readOnly />
          </label>
        )}
      </div>

      <div className="subject-grid">
        {subjects.map((subject: Subject) => (
          <article className="subject-card" key={subject.code}>
            <div>
              <span className="code">{subject.code}</span>
              <h2>{subject.name}</h2>
              <p>{subject.units.length} Units · Notes · Exam Papers</p>
            </div>
            <div className="unit-links">
              {subject.units.map(unit => (
                <button key={unit.unitId} onClick={() => onSelect(subject, unit)}>
                  Unit {unit.unitId}: {unit.title} <span>→</span>
                </button>
              ))}
            </div>
          </article>
        ))}
        {subjects.length === 0 && <p>No subjects added for this year/branch yet.</p>}
      </div>
    </main>
  )
}

function UnitPage({ subject, unit, tab, setTab, unlocked, setUnlocked, showToast, onBack, apiUrl, fileToBase64, openBase64Pdf }: any) {
  const resources: ResourceType[] = ['Syllabus', 'Sessional papers', 'Previous papers', 'Notes']
  const [notesList, setNotesList] = useState<NoteItem[]>([])
  const [papersList, setPapersList] = useState<PaperItem[]>([])
  const [syllabusTopics, setSyllabusTopics] = useState<string[]>([])
  const [aiNotesText, setAiNotesText] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const token = localStorage.getItem('abes_token')

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/syllabus/${subject.code}/${unit.unitId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setSyllabusTopics(data.topics?.length ? data.topics : unit.topics || []))
      .catch(() => setSyllabusTopics(unit.topics || []))
  }, [apiUrl, subject.code, token, unit.topics, unit.unitId])

  useEffect(() => {
    if (tab === 'Notes' && unlocked) {
      fetch(`${apiUrl}/api/notes/${subject.code}/${unit.unitId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setNotesList(data) })
        .catch(() => showToast('Error loading notes.'))
    }
  }, [apiUrl, subject.code, tab, token, unit.unitId, unlocked])

  useEffect(() => {
    if (tab === 'Sessional papers' || tab === 'Previous papers') {
      fetch(`${apiUrl}/api/papers/${subject.code}/${unit.unitId}/${encodeURIComponent(tab)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setPapersList(data) })
    }
  }, [apiUrl, subject.code, tab, token, unit.unitId])

  const handleNoteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') return showToast('Upload a PDF file.')
    if (file.size > 10 * 1024 * 1024) return showToast('File size must be under 10MB.')
    try {
      setEvaluating(true)
      showToast('Evaluating handwritten note with Gemini AI Vision...')
      const res = await fetch(`${apiUrl}/api/ai/evaluate-and-upload-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: file.name.replace('.pdf', ''), subjectCode: subject.code, unitId: unit.unitId, pdfBase64: await fileToBase64(file) })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Evaluation failed.')
      if (result.passed) {
        setUnlocked(true)
        showToast(`🎉 Quality Rating: ${result.rating}/5.0! Notes library unlocked.`)
        const freshNotes = await fetch(`${apiUrl}/api/notes/${subject.code}/${unit.unitId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
        if (Array.isArray(freshNotes)) setNotesList(freshNotes)
      } else {
        showToast(`❌ Rating: ${result.rating}/5.0 (Min 3.0 needed). Reason: ${result.explanation}`)
      }
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setEvaluating(false)
    }
  }

  const handlePaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const res = await fetch(`${apiUrl}/api/papers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: tab, title: file.name.replace('.pdf', ''), subjectCode: subject.code, unitId: unit.unitId, pdfBase64: await fileToBase64(file) })
    })
    if (res.ok) {
      showToast('Paper uploaded successfully!')
      const updated = await fetch(`${apiUrl}/api/papers/${subject.code}/${unit.unitId}/${encodeURIComponent(tab)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      if (Array.isArray(updated)) setPapersList(updated)
    }
  }

  const generateAiNotes = async () => {
    showToast('Generating syllabus-aligned study notes...')
    const res = await fetch(`${apiUrl}/api/ai/generate-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subjectCode: subject.code, unitId: unit.unitId })
    })
    const data = await res.json()
    if (data.generatedNotes) setAiNotesText(data.generatedNotes)
  }

  const openNotePdf = async (id: string) => {
    const res = await fetch(`${apiUrl}/api/note/file/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.pdfBase64) openBase64Pdf(data.pdfBase64)
  }

  const openPaperPdf = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/paper/file/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not open paper.')
      openBase64Pdf(data.pdfBase64)
    } catch (error: any) {
      showToast(error.message)
    }
  }

  return (
    <main className="content">
      <button className="back" onClick={onBack}>← Back to subjects</button>
      <p className="eyebrow green">{subject.code} · UNIT {unit.unitId}</p>
      <h1>{unit.title}</h1>
      <p className="lead">{subject.name}</p>
      <nav className="tabs">
        {resources.map(item => <button className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}{item === 'Notes' && unlocked && <i> unlocked</i>}</button>)}
      </nav>

      {tab === 'Syllabus' && <section className="panel"><h2>Official Unit Syllabus</h2><p className="muted">Uploaded by Department Head & used as AI evaluation benchmark</p><ol>{syllabusTopics.map((topic, i) => <li key={i}>{topic}</li>)}</ol></section>}

      {(tab === 'Sessional papers' || tab === 'Previous papers') && (
        <section className="panel">
          <div className="panel-head"><div><h2>{tab}</h2><p className="muted">Open academic material shared by students</p></div><label className="upload-small">+ Upload paper<input type="file" accept="application/pdf" onChange={handlePaperUpload} /></label></div>
          {papersList.map(paper => <div className="file-row" key={paper._id}><span className="pdf">PDF</span><div><b>{paper.title}</b><small>Added {new Date(paper.createdAt).toLocaleDateString()}</small></div><button onClick={() => openPaperPdf(paper._id)}>Open PDF →</button></div>)}
          {papersList.length === 0 && <p className="muted" style={{ marginTop: 15 }}>No papers uploaded yet.</p>}
        </section>
      )}

      {tab === 'Notes' && (
        <section>
          <div className="notes-banner"><div><span className="spark">✦</span><h2>Share once. Unlock everything.</h2><p>{unlocked ? 'You have full access to all student notes.' : 'Upload 1 genuine handwritten PDF note to let AI verify quality (Min rating 3.0/5.0 required).'}</p></div>{!unlocked && <label className="primary upload">{evaluating ? 'Analyzing Notes...' : 'Upload Notes PDF to Unlock'}<input type="file" accept="application/pdf" disabled={evaluating} onChange={handleNoteUpload} /></label>}</div>
          {unlocked ? <>
            <div className="ai-note"><span>✦</span><div><b>AI Instant Study Notes</b><p>Generate clean, topic-by-topic revision summaries for this unit.</p></div><button onClick={generateAiNotes}>Generate Notes →</button></div>
            {aiNotesText && <div className="panel" style={{ marginTop: 20, whiteSpace: 'pre-line' }}><h3>Generated Revision Summary</h3><p>{aiNotesText}</p></div>}
            <h2 className="section-title">Community Notes <small>(Sorted by AI Rating)</small></h2>
            {notesList.map(note => <article className="note-row" key={note._id}><span className="pdf">PDF</span><div><h3>{note.title}</h3><p>{note.ownerEmail} · {new Date(note.createdAt).toLocaleDateString()}</p></div><strong>★ {note.rating.toFixed(1)} / 5.0</strong><button onClick={() => openNotePdf(note._id)}>Open PDF →</button></article>)}
          </> : <div className="locked"><span>🔒</span><h2>Notes Library is Locked</h2><p>Upload 1 handwritten study note PDF. Gemini AI will evaluate readability, handwriting, and syllabus coverage.</p><label className="primary upload">Upload Notes to Pass Test<input type="file" accept="application/pdf" onChange={handleNoteUpload} /></label><small>Notes scoring 3.0 / 5.0 or above unlock full peer notes access.</small></div>}
        </section>
      )}
    </main>
  )
}

function AdminPortal({ onBack, showToast, apiUrl }: any) {
  const [subjectName, setSubjectName] = useState('')
  const [subjectCode, setSubjectCode] = useState('')
  const [course, setCourse] = useState('B.Tech')
  const [year, setYear] = useState('2nd Year')
  const [branch, setBranch] = useState('Computer Science & Engineering')
  const [syllabusCode, setSyllabusCode] = useState('')
  const [unitId, setUnitId] = useState(1)
  const [topicsText, setTopicsText] = useState('')
  const [managedSubjects, setManagedSubjects] = useState<Subject[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [paperSubjectCode, setPaperSubjectCode] = useState('')
  const [paperUnitId, setPaperUnitId] = useState(1)
  const [paperType, setPaperType] = useState<'Sessional papers' | 'Previous papers'>('Sessional papers')
  const [paperFile, setPaperFile] = useState<File | null>(null)
  const [uploadingPaper, setUploadingPaper] = useState(false)
  const token = localStorage.getItem('abes_token')
  const needsBranch = coursesWithBranches.has(course)
  const selectedBranch = needsBranch ? branch : course

  const loadSubjects = async () => {
    setLoadingSubjects(true)
    try {
      const res = await fetch(`${apiUrl}/api/admin/subjects?course=${encodeURIComponent(course)}&year=${encodeURIComponent(year)}&branch=${encodeURIComponent(selectedBranch)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load subjects.')
      setManagedSubjects(Array.isArray(data) ? data : [])
    } catch (error: any) {
      showToast(error.message)
    } finally {
      setLoadingSubjects(false)
    }
  }

  useEffect(() => {
    loadSubjects()
  }, [apiUrl, branch, course, year])

  const createSubject = async () => {
    if (!subjectName || !subjectCode) return showToast('Fill all subject fields.')
    const res = await fetch(`${apiUrl}/api/admin/subject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: subjectName, code: subjectCode, course, year, branch: selectedBranch, units: [
        { unitId: 1, title: 'Unit 1', topics: [] }, { unitId: 2, title: 'Unit 2', topics: [] }, { unitId: 3, title: 'Unit 3', topics: [] }, { unitId: 4, title: 'Unit 4', topics: [] }, { unitId: 5, title: 'Unit 5', topics: [] }
      ] })
    })
    if (res.ok) {
      showToast('Subject created successfully!')
      setSubjectName('')
      setSubjectCode('')
      await loadSubjects()
    }
  }

  const saveSyllabus = async () => {
    if (!syllabusCode || !topicsText) return showToast('Provide subject code and topics.')
    const topics = topicsText.split('\n').filter(t => t.trim().length > 0)
    const res = await fetch(`${apiUrl}/api/admin/syllabus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subjectCode: syllabusCode, unitId: Number(unitId), topics })
    })
    if (res.ok) {
      showToast(`Syllabus saved for ${syllabusCode} Unit ${unitId}!`)
      setTopicsText('')
    }
  }

  const deleteSubject = async (subject: Subject) => {
    if (!subject._id || !window.confirm(`Delete ${subject.name}? Its syllabus, notes, and papers will also be deleted.`)) return
    const res = await fetch(`${apiUrl}/api/admin/subject/${subject._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) return showToast(data.error ?? 'Could not delete subject.')
    if (syllabusCode === subject.code) setSyllabusCode('')
    showToast('Subject and its related resources were deleted.')
    await loadSubjects()
  }

  const uploadAdminPaper = async () => {
    if (!paperSubjectCode || !paperFile) return showToast('Choose a subject and PDF paper first.')
    if (paperFile.type !== 'application/pdf') return showToast('Upload a PDF file.')
    if (paperFile.size > 10 * 1024 * 1024) return showToast('File size must be under 10MB.')

    setUploadingPaper(true)
    try {
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(paperFile)
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
      })
      const res = await fetch(`${apiUrl}/api/papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: paperType,
          title: paperFile.name.replace('.pdf', ''),
          subjectCode: paperSubjectCode,
          unitId: paperUnitId,
          pdfBase64
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not upload paper.')
      setPaperFile(null)
      showToast(`${paperType} uploaded. All signed-in students can open it.`)
    } catch (error: any) {
      showToast(error.message)
    } finally {
      setUploadingPaper(false)
    }
  }

  return (
    <main className="content">
      <button className="back" onClick={onBack}>← Return to Student View</button>
      <p className="eyebrow green">ADMINISTRATIVE DASHBOARD</p>
      <h1>Syllabus & Hierarchy Control</h1>
      <section className="admin-grid">
        <article className="panel">
          <h2>Create New Subject</h2>
          <label>Subject Name<input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Operating Systems" /></label>
          <label>Subject Code<input value={subjectCode} onChange={e => setSubjectCode(e.target.value)} placeholder="e.g. KCS-401" /></label>
          <label>Course
            <select value={course} onChange={e => {
              const nextCourse = e.target.value
              setCourse(nextCourse)
              if (!coursesWithBranches.has(nextCourse)) setBranch(nextCourse)
            }}>
              <option>B.Tech</option><option>M.Tech</option><option>BCA</option><option>MCA</option><option>MBA</option>
            </select>
          </label>
          <label>Year<select value={year} onChange={e => setYear(e.target.value)}><option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option></select></label>
          {needsBranch && <label>Branch<select value={branch} onChange={e => setBranch(e.target.value)}><option>Computer Science & Engineering</option><option>Information Technology</option><option>Electronics & Communication</option><option>Electrical & Electronics Engineering</option><option>Mechanical Engineering</option><option>Civil Engineering</option></select></label>}
          <button className="primary" onClick={createSubject}>+ Add Subject</button>
        </article>
        <article className="panel">
          <h2>Unit Syllabus Benchmark</h2>
          <p className="muted">Select a subject and unit. Gemini uses these topics when checking submitted notes.</p>
          <label>Subject
            <select value={syllabusCode} onChange={e => setSyllabusCode(e.target.value)}>
              <option value="">Select a subject</option>
              {managedSubjects.map(subject => <option key={subject._id ?? subject.code} value={subject.code}>{subject.code} — {subject.name}</option>)}
            </select>
          </label>
          <label>Unit Number<select value={unitId} onChange={e => setUnitId(Number(e.target.value))}><option value={1}>Unit 1</option><option value={2}>Unit 2</option><option value={3}>Unit 3</option><option value={4}>Unit 4</option><option value={5}>Unit 5</option></select></label>
          <label>Topics (One per line)<textarea style={{ width: '100%', height: 100, padding: 10, borderRadius: 8, border: '1px solid #ccc' }} value={topicsText} onChange={e => setTopicsText(e.target.value)} placeholder={'Array algorithms\nLinked list operations\nStack expressions'} /></label>
          <button className="primary" onClick={saveSyllabus}>Save Syllabus Benchmark</button>
        </article>
        <article className="panel">
          <h2>Manage Subjects</h2>
          <p className="muted">{course} · {year} · {selectedBranch}</p>
          <div className="admin-subject-list">
            {loadingSubjects && <p className="muted">Loading subjects...</p>}
            {!loadingSubjects && managedSubjects.length === 0 && <p className="muted">No subjects for this selection yet.</p>}
            {managedSubjects.map(subject => (
              <div className="admin-subject-row" key={subject._id ?? subject.code}>
                <div><b>{subject.name}</b><small>{subject.code} · 5 units</small></div>
                <button className="danger" onClick={() => deleteSubject(subject)}>Delete</button>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Upload Open Question Paper</h2>
          <p className="muted">Sessional and previous-year papers are available to every signed-in student. They do not require note verification.</p>
          <label>Paper Type
            <select value={paperType} onChange={e => setPaperType(e.target.value as 'Sessional papers' | 'Previous papers')}>
              <option value="Sessional papers">Sessional papers</option>
              <option value="Previous papers">Previous papers</option>
            </select>
          </label>
          <label>Subject
            <select value={paperSubjectCode} onChange={e => setPaperSubjectCode(e.target.value)}>
              <option value="">Select a subject</option>
              {managedSubjects.map(subject => <option key={subject._id ?? subject.code} value={subject.code}>{subject.code} — {subject.name}</option>)}
            </select>
          </label>
          <label>Unit Number
            <select value={paperUnitId} onChange={e => setPaperUnitId(Number(e.target.value))}>
              <option value={1}>Unit 1</option><option value={2}>Unit 2</option><option value={3}>Unit 3</option><option value={4}>Unit 4</option><option value={5}>Unit 5</option>
            </select>
          </label>
          <label>PDF Paper
            <input type="file" accept="application/pdf" onChange={e => setPaperFile(e.target.files?.[0] ?? null)} />
          </label>
          <button className="primary" disabled={uploadingPaper} onClick={uploadAdminPaper}>
            {uploadingPaper ? 'Uploading...' : 'Upload Paper'}
          </button>
        </article>
      </section>
    </main>
  )
}
