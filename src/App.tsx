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
  rating?: number
  analysis?: {
    rating?: number
    badge?: string
    contentScore?: number
    handwritingScore?: number
    overallScore?: number
  }
  explanation?: string
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
  profilePic?: string
}

const coursesWithBranches = new Set(['B.Tech', 'M.Tech'])

function NoteNestLogo({ size = 34 }: { size?: number }) {
  return (
    <div className="notenest-logo" style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 8px rgba(14, 91, 77, 0.2))' }}>
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="10" fill="url(#logoGrad)" />
        {/* Open Notebook frame */}
        <path d="M10 11C10 9.89543 10.8954 9 12 9H24C25.1046 9 26 9.89543 26 11V23C26 24.1046 25.1046 25 24 25H12C10.8954 25 10 24.1046 10 23V11Z" fill="#0A463B" stroke="#C5F250" strokeWidth="2" />
        {/* Content lines */}
        <path d="M14 14H22M14 18H22M14 22H18" stroke="#C5F250" strokeWidth="2" strokeLinecap="round" />
        {/* Nest Cradle Curve at bottom */}
        <path d="M8 24C12 28.5 24 28.5 28 24" stroke="#FB754B" strokeWidth="3" strokeLinecap="round" />
        {/* AI Sparkle Star */}
        <path d="M26 6L27.2 9.2L30.4 10.4L27.2 11.6L26 14.8L24.8 11.6L21.6 10.4L24.8 9.2L26 6Z" fill="#FFD700" />
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0E5B4D" />
            <stop offset="1" stopColor="#083D33" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

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
  const [profilePic, setProfilePic] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
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
    if (profile.profilePic) setProfilePic(profile.profilePic)
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
          <div className="brand-header">
            <NoteNestLogo size={48} />
            <span className="brand-title">NoteNest</span>
          </div>
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
          <div className="mobile-mark" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
            <NoteNestLogo size={36} />
            <span style={{ font: '700 24px Georgia', color: '#0e5b4d' }}>NoteNest</span>
          </div>
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
          <NoteNestLogo size={32} />
          <b>NoteNest</b> <span>ABES Academic Hub</span>
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
          <div className="avatar-clickable" title="View Profile & Help" onClick={() => setShowProfileModal(true)}>
            {profilePic ? (
              <img src={profilePic} alt="Profile" className="avatar-img" />
            ) : (
              <div className="avatar">{email ? email.substring(0, 2).toUpperCase() : 'VI'}</div>
            )}
          </div>
        </div>
      </header>

      {toast && <div className="toast">✓ {toast}</div>}

      {showProfileModal && (
        <ProfileModal
          name={welcomeName}
          email={email}
          year={year}
          branch={branch}
          course={course}
          unlocked={unlocked}
          profilePic={profilePic}
          apiUrl={apiUrl}
          onClose={() => setShowProfileModal(false)}
          onOpenHelp={() => {
            setShowProfileModal(false)
            setShowHelpModal(true)
          }}
          onEditProfile={() => {
            setShowProfileModal(false)
            setScreen('profile')
          }}
          onSignOut={() => {
            localStorage.removeItem('abes_token')
            setShowProfileModal(false)
            setScreen('login')
          }}
          onProfilePicUpdated={(newPic: string) => setProfilePic(newPic)}
          showToast={showToast}
        />
      )}

      {showHelpModal && (
        <HelpGuideModal onClose={() => setShowHelpModal(false)} />
      )}

      {screen === 'profile' ? (
        <ProfileSetup
          course={course}
          year={year}
          branch={branch}
          apiUrl={apiUrl}
          onSaved={(profile: any) => {
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

function FormattedAiNotes({ text, onCopy }: { text: string; onCopy: () => void }) {
  const parseInlineBold = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="term-highlight">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul className="ai-note-list" key={`list-${elements.length}`}>
          {currentList}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed === '--' || trimmed === '---') {
      flushList();
      if (trimmed === '--' || trimmed === '---') {
        elements.push(<hr key={`hr-${index}`} className="ai-note-divider" />);
      }
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h2 className="ai-note-h1" key={index}>{trimmed.replace('# ', '')}</h2>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h3 className="ai-note-h2" key={index}>{trimmed.replace('## ', '')}</h3>);
    } else if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h4 className="ai-note-h3" key={index}>{trimmed.replace('### ', '')}</h4>);
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const listContent = trimmed.slice(2);
      currentList.push(<li key={index}>{parseInlineBold(listContent)}</li>);
    } else {
      flushList();
      elements.push(<p className="ai-note-p" key={index}>{parseInlineBold(trimmed)}</p>);
    }
  });

  flushList();

  return (
    <div className="ai-notes-viewer">
      <div className="ai-notes-header">
        <h3><span>✦</span> Generated Revision Notes</h3>
        <button className="copy-btn" onClick={onCopy}>📋 Copy Notes</button>
      </div>
      <div className="ai-notes-body">{elements}</div>
    </div>
  );
}

function UnitPage({ subject, unit, tab, setTab, unlocked, setUnlocked, showToast, onBack, apiUrl, fileToBase64, openBase64Pdf }: any) {
  const resources: ResourceType[] = ['Syllabus', 'Sessional papers', 'Previous papers', 'Notes']
  const [notesList, setNotesList] = useState<NoteItem[]>([])
  const [papersList, setPapersList] = useState<PaperItem[]>([])
  const [syllabusTopics, setSyllabusTopics] = useState<string[]>([])
  const [aiNotesText, setAiNotesText] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [generatingAiNotes, setGeneratingAiNotes] = useState(false)
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
    
    console.log("handleNoteUpload called");
    const file = e.target.files?.[0]
    console.log(file);
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
    setGeneratingAiNotes(true)
    setAiNotesText('')
    showToast('Synthesizing study notes with Gemini AI...')
    try {
      const res = await fetch(`${apiUrl}/api/ai/generate-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subjectCode: subject.code, unitId: unit.unitId })
      })
      const data = await res.json()
      if (data.generatedNotes) {
        setAiNotesText(data.generatedNotes)
      } else {
        showToast('Could not generate notes.')
      }
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setGeneratingAiNotes(false)
    }
  }

  const deleteNote = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return
    try {
      const res = await fetch(`${apiUrl}/api/notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not delete note.')
      showToast('Note deleted.')
      setNotesList(prev => prev.filter(n => n._id !== id))
    } catch (err: any) {
      showToast(err.message)
    }
  }

  const deletePaper = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this paper?')) return
    try {
      const res = await fetch(`${apiUrl}/api/papers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not delete paper.')
      showToast('Paper deleted.')
      setPapersList(prev => prev.filter(p => p._id !== id))
    } catch (err: any) {
      showToast(err.message)
    }
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

      {tab === 'Syllabus' && (
        <section className="panel">
          <h2>Official Unit Syllabus</h2>
          <p className="muted">Uploaded by Department Head & used as AI evaluation benchmark</p>
          {syllabusTopics.length > 0 ? (
            <div className="syllabus-paragraph-box">
              <p className="syllabus-paragraph-text">
                {syllabusTopics.map((topic, i) => (
                  <span className="syllabus-topic-pill" key={i}>
                    {topic}
                  </span>
                ))}
              </p>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 15 }}>No syllabus uploaded yet by admin.</p>
          )}
        </section>
      )}

      {(tab === 'Sessional papers' || tab === 'Previous papers') && (
        <section className="panel">
          <div className="panel-head"><div><h2>{tab}</h2><p className="muted">Open academic material shared by students</p></div><label className="upload-small">+ Upload paper<input type="file" accept="application/pdf" onChange={handlePaperUpload} /></label></div>
          {papersList.map(paper => (
            <div className="file-row" key={paper._id}>
              <span className="pdf">PDF</span>
              <div><b>{paper.title}</b><small>Added {new Date(paper.createdAt).toLocaleDateString()}</small></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => openPaperPdf(paper._id)}>Open PDF →</button>
                <button className="danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => deletePaper(paper._id)}>Delete</button>
              </div>
            </div>
          ))}
          {papersList.length === 0 && <p className="muted" style={{ marginTop: 15 }}>No papers uploaded yet.</p>}
        </section>
      )}

      {tab === 'Notes' && (
        <section>
          <div className="notes-banner"><div><span className="spark">✦</span><h2>Share once. Unlock everything.</h2><p>{unlocked ? 'You have full access to all student notes.' : 'Upload 1 genuine handwritten PDF note to let AI verify quality (Min rating 3.0/5.0 required).'}</p></div>{!unlocked && <label className="primary upload">{evaluating ? 'Analyzing Notes...' : 'Upload Notes PDF to Unlock'}<input type="file" accept="application/pdf" disabled={evaluating} onChange={handleNoteUpload} /></label>}</div>
          {unlocked ? <>
            <div className="ai-note">
              <span>✦</span>
              <div>
                <b>AI Instant Study Notes</b>
                <p>Generate clean, topic-by-topic revision summaries for this unit based on syllabus.</p>
              </div>
              <button disabled={generatingAiNotes} onClick={generateAiNotes}>
                {generatingAiNotes ? (
                  <>
                    <span className="sparkle-spin">✦</span> Generating Notes...
                  </>
                ) : (
                  'Read AI Notes →'
                )}
              </button>
            </div>

            {generatingAiNotes && (
              <div className="ai-loading-card">
                <span className="big-spark">✦</span>
                <h3>Synthesizing Revision Notes with Gemini AI...</h3>
                <p>Analyzing unit syllabus topics & structuring key definitions, formulas, and exam concepts.</p>
                <div className="skeleton-container">
                  <div className="skeleton-bar"></div>
                  <div className="skeleton-bar short"></div>
                  <div className="skeleton-bar"></div>
                </div>
              </div>
            )}

            {!generatingAiNotes && aiNotesText && (
              <FormattedAiNotes
                text={aiNotesText}
                onCopy={() => {
                  navigator.clipboard.writeText(aiNotesText)
                  showToast('Notes copied to clipboard!')
                }}
              />
            )}
            <h2 className="section-title">Community Notes <small>(Sorted by AI Rating)</small></h2>
            {notesList.map(note => {
              const val = note.rating ?? note.analysis?.rating ?? 0;
              return (
                <article className="note-row" key={note._id}>
                  <span className="pdf">PDF</span>
                  <div>
                    <h3>{note.title}</h3>
                    <p>{note.ownerEmail} · {new Date(note.createdAt).toLocaleDateString()}</p>
                  </div>
                  <strong>★ {Number(val).toFixed(1)} / 5.0</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openNotePdf(note._id)}>Open PDF →</button>
                    <button className="danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => deleteNote(note._id)}>Delete</button>
                  </div>
                </article>
              )
            })}
            {notesList.length === 0 && <p className="muted" style={{ marginTop: 15 }}>No notes uploaded for this unit yet.</p>}
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

function ProfileModal({
  name,
  email,
  year,
  branch,
  course,
  unlocked,
  profilePic,
  apiUrl,
  onClose,
  onOpenHelp,
  onEditProfile,
  onSignOut,
  onProfilePicUpdated,
  showToast
}: any) {
  const [uploadingPic, setUploadingPic] = useState(false)

  const handlePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return showToast('Please select an image file.')
    if (file.size > 5 * 1024 * 1024) return showToast('Image size must be under 5MB.')

    setUploadingPic(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
      })

      const token = localStorage.getItem('abes_token')
      const res = await fetch(`${apiUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profilePic: base64 })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not upload profile picture.')
      onProfilePicUpdated(base64)
      showToast('✓ Profile picture updated!')
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setUploadingPic(false)
    }
  }

  const initials = email ? email.substring(0, 2).toUpperCase() : 'VI'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="profile-avatar-upload">
          {profilePic ? (
            <img src={profilePic} alt="Profile" className="large-avatar-img" />
          ) : (
            <div className="large-avatar-text">{initials}</div>
          )}
          <label className="camera-badge" title="Upload profile picture">
            📷
            <input type="file" accept="image/*" disabled={uploadingPic} onChange={handlePicUpload} />
          </label>
        </div>

        <h2 style={{ textAlign: 'center', margin: '0 0 4px', fontSize: 20 }}>{name}</h2>
        <p style={{ textAlign: 'center', color: '#69746f', fontSize: 13, margin: '0 0 16px' }}>{email}</p>

        <div className="profile-info-list">
          <div className="profile-info-row">
            <span>Course & Year</span>
            <strong>{course || 'B.Tech'} · {year || 'Not Set'}</strong>
          </div>
          <div className="profile-info-row">
            <span>Branch</span>
            <strong>{branch || 'Not Set'}</strong>
          </div>
          <div className="profile-info-row">
            <span>Notes Library</span>
            <strong>{unlocked ? 'Unlocked 🔓' : 'Locked 🔒'}</strong>
          </div>
        </div>

        <button className="help-btn" onClick={onOpenHelp}>
          ❓ How to take maximum advantage of NoteNest
        </button>

        <button className="secondary-btn" onClick={onEditProfile}>
          ✏️ Edit Academic Year & Branch
        </button>

        <button className="danger" style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 9, cursor: 'pointer' }} onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

function HelpGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#0e5b4d' }}>How to Benefit from NoteNest 🪹</h2>
        <p style={{ color: '#69746f', fontSize: 13, margin: '0 0 20px' }}>
          Your ultimate ABES Academic Hub guide to scoring higher in exams.
        </p>

        <div className="help-guide-list">
          <div className="help-card">
            <span className="help-card-icon">🔓</span>
            <div>
              <h4>1. Share 1 Note, Unlock Everything</h4>
              <p>Upload at least 1 handwritten study note PDF of any unit. Gemini AI checks legibility and syllabus coverage (&ge; 3.0 rating required). Once verified, you get full access to all peer notes across all subjects!</p>
            </div>
          </div>

          <div className="help-card">
            <span className="help-card-icon">✦</span>
            <div>
              <h4>2. Instant AI Study Notes</h4>
              <p>Click <b>Read AI Notes</b> inside any subject unit to view clean, structured revision summaries synthesized directly from official syllabus topics.</p>
            </div>
          </div>

          <div className="help-card">
            <span className="help-card-icon">📄</span>
            <div>
              <h4>3. Open Exam Papers</h4>
              <p>Sessional Test Papers and Previous Year AKTU Question Papers are available to all students without any locking condition.</p>
            </div>
          </div>

          <div className="help-card">
            <span className="help-card-icon">📚</span>
            <div>
              <h4>4. Department Syllabus Benchmark</h4>
              <p>Check the exact unit syllabus topics uploaded by the department head to stay focused on high-yield exam material.</p>
            </div>
          </div>
        </div>

        <button className="primary" style={{ width: '100%', marginTop: 10, cursor: 'pointer' }} onClick={onClose}>
          Got it, let's study! 🚀
        </button>
      </div>
    </div>
  )
}

