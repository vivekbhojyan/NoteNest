import 'dotenv/config'
import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose, { Schema } from 'mongoose'
import nodemailer from 'nodemailer'
import { GoogleGenAI } from '@google/genai'

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
// Allow up to 20MB JSON payload to handle Base64 encoded PDFs comfortably (up to 10MB raw file size)
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ limit: '20mb', extended: true }))

// --- MONGODB SCHEMAS ---
const otpSchema = new Schema({
  email: { type: String, unique: true, index: true },
  hash: String,
  expiresAt: Date,
  attempts: { type: Number, default: 0 }
}, { timestamps: true })

const userSchema = new Schema({
  email: { type: String, unique: true, index: true },

  course: {
    type: String,
    default: ""
  },

  academicYear: {
    type: String,
    default: ""
  },

  branch: {
    type: String,
    default: ""
  },

  notesUnlocked: {
    type: Boolean,
    default: false
  },

  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student'
  }
}, { timestamps: true })

const subjectSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  course: { type: String, required: true, default: 'B.Tech' },
  year: { type: String, required: true },
  branch: { type: String, required: true },
  units: [{
    unitId: Number,
    title: String,
    topics: [String]
  }]
}, { timestamps: true })

const syllabusSchema = new Schema({
  subjectCode: String,
  unitId: Number,
  topics: [String],
  pdfBase64: String
}, { timestamps: true })

const noteSchema = new Schema({
  title: String,
  ownerEmail: String,
  subjectCode: String,
  unitId: Number,
  rating: Number,
  readability: Number,
  handwriting: Number,
  clarity: Number,
  coverage: Number,
  explanation: String,
  pdfBase64: String
}, { timestamps: true })

const paperSchema = new Schema({
  type: { type: String, enum: ['Sessional papers', 'Previous papers'] },
  title: String,
  subjectCode: String,
  unitId: Number,
  pdfBase64: String
}, { timestamps: true })

const Otp = mongoose.model('Otp', otpSchema)
const User = mongoose.model('User', userSchema)
const Subject = mongoose.model('Subject', subjectSchema)
const Syllabus = mongoose.model('Syllabus', syllabusSchema)
const Note = mongoose.model('Note', noteSchema)
const Paper = mongoose.model('Paper', paperSchema)

// --- SERVICES SETUP ---
const transport = nodemailer.createTransport({
  host: env('SMTP_HOST'),
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
})

const ai = new GoogleGenAI({ apiKey: env('AI_API_KEY') })

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const validCollegeEmail = (email: string) => /^[^\s@]+@abes\.ac\.in$/i.test(email)
const isAdminEmail = (email: string) => email === process.env.ADMIN_EMAIL?.trim().toLowerCase()

// --- MIDDLEWARE ---
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized token missing.' })
  try {
    const decoded = jwt.verify(token, env('JWT_SECRET')) as { sub: string; email: string; role: string }
    ;(req as any).user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token.' })
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }))

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/request-otp', async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    if (!validCollegeEmail(email)) return res.status(400).json({ error: 'Use your @abes.ac.in college email.' })
    
    const otp = crypto.randomInt(100000, 1000000).toString()
    await Otp.findOneAndUpdate(
      { email },
      { hash: hash(`${email}:${otp}`), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0 },
      { upsert: true, new: true }
    )

    await transport.sendMail({
      from: env('MAIL_FROM'),
      to: email,
      subject: 'Your ABES Academic Hub OTP',
      text: `Your one-time password is ${otp}. It expires in 10 minutes. Do not share this code.`
    })

    res.status(202).json({ message: 'OTP sent successfully.' })
  } catch (error) { next(error) }
})

app.post('/api/auth/verify-otp', async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const otp = String(req.body.otp ?? '')
    const record = await Otp.findOne({ email })

    const expired = !record?.expiresAt || record.expiresAt < new Date()
    const wrongOtp = !record?.hash || !crypto.timingSafeEqual(Buffer.from(String(record.hash)), Buffer.from(hash(`${email}:${otp}`)))

    if (!record || expired || Number(record.attempts ?? 0) >= 5 || wrongOtp) {
      if (record) { record.attempts += 1; await record.save() }
      return res.status(401).json({ error: 'Invalid or expired OTP.' })
    }

    await Otp.deleteOne({ _id: record._id })

    // Set ADMIN_EMAIL in .env to make one college account an administrator.
    const defaultRole = isAdminEmail(email) ? 'admin' : 'student'

    const user = await User.findOneAndUpdate(
      { email },
      isAdminEmail(email)
        ? { $set: { role: 'admin' }, $setOnInsert: { email } }
        : { $setOnInsert: { email, role: defaultRole } },
      { upsert: true, new: true }
    )

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, env('JWT_SECRET'), { expiresIn: '8h' })
    res.json({
    token,
    user: {
        email: user.email,
        role: user.role,
        notesUnlocked: user.notesUnlocked,
        course: user.course,
        academicYear: user.academicYear,
        branch: user.branch
    }
})
  } catch (error) { next(error) }
})

app.get('/api/profile', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById((req as any).user.sub)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    res.json({
      email: user.email,
      course: user.course,
      academicYear: user.academicYear,
      branch: user.branch,
      role: user.role,
      notesUnlocked: user.notesUnlocked
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/profile', authMiddleware, async (req, res, next) => {
  try {
    const { course, academicYear, branch } = req.body
    const allowedCourses = ['B.Tech', 'M.Tech', 'BCA', 'MCA', 'MBA']
    const allowedYears = ['1st Year', '2nd Year', '3rd Year', '4th Year']
    if (!allowedCourses.includes(course) || !allowedYears.includes(academicYear) || !String(branch ?? '').trim()) {
      return res.status(400).json({ error: 'Choose a valid course, academic year, and branch.' })
    }

    const user = await User.findByIdAndUpdate(
      (req as any).user.sub,
      {
        course,
        academicYear,
        branch
      },
      { new: true }
    )

    res.json({
      success: true,
      user
    })
  } catch (error) {
    next(error)
  }
})

// --- SUBJECTS & CATALOG ---
app.get('/api/subjects', authMiddleware, async (req, res, next) => {
  try {
    const { course, year, branch } = req.query
    const filter: any = {}
    if (course) filter.course = course
    if (year) filter.year = year
    if (branch) filter.branch = branch
    const subjects = await Subject.find(filter)
    res.json(subjects)
  } catch (error) { next(error) }
})

app.post('/api/admin/subject', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
    const { name, code, course, year, branch, units } = req.body
    if (!name || !code || !course || !year || !branch || !Array.isArray(units) || units.length !== 5) {
      return res.status(400).json({ error: 'A subject needs course, year, branch, and exactly five units.' })
    }
    const subject = await Subject.create({ name, code: String(code).toUpperCase(), course, year, branch, units })
    res.json(subject)
  } catch (error) { next(error) }
})

app.get('/api/admin/subjects', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
    const { course, year, branch } = req.query
    const filter: any = {}
    if (course) filter.course = course
    if (year) filter.year = year
    if (branch) filter.branch = branch
    res.json(await Subject.find(filter).sort({ course: 1, year: 1, branch: 1, name: 1 }))
  } catch (error) { next(error) }
})

app.delete('/api/admin/subject/:id', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
    const subject = await Subject.findByIdAndDelete(req.params.id)
    if (!subject) return res.status(404).json({ error: 'Subject not found.' })
    await Promise.all([
      Syllabus.deleteMany({ subjectCode: subject.code }),
      Note.deleteMany({ subjectCode: subject.code }),
      Paper.deleteMany({ subjectCode: subject.code })
    ])
    res.json({ success: true })
  } catch (error) { next(error) }
})

// --- AI EVALUATION & NOTE UPLOAD (VISION OCR) ---
app.post('/api/ai/evaluate-and-upload-note', authMiddleware, async (req, res, next) => {
  try {
    const { title, subjectCode, unitId, pdfBase64 } = req.body
    if (!title || !subjectCode || !unitId || !pdfBase64) {
      return res.status(400).json({ error: 'Missing required note parameters or PDF.' })
    }

    // 1. Fetch official syllabus benchmark
    const syllabusRecord = await Syllabus.findOne({ subjectCode, unitId: Number(unitId) })
    const syllabusTopics = syllabusRecord?.topics ?? ['Core course concepts']

    // 2. Evaluate uploaded PDF via Gemini Vision API
    const prompt = `
    You are an expert academic reviewer evaluating student handwritten study notes against an official syllabus.
    Official Syllabus Topics: ${JSON.stringify(syllabusTopics)}.

    Evaluate the attached PDF note and score each metric strictly from 1.0 to 5.0:
    - readability: Legibility of written text and formulas.
    - handwriting: Neatness and handwriting quality.
    - clarity: Structural clarity, headings, and diagram clarity.
    - coverage: How thoroughly it covers syllabus topics.

    Calculate rating = (25% readability + 20% handwriting + 25% clarity + 30% coverage).
    Return ONLY a single valid JSON object format:
    {"readability": number, "handwriting": number, "clarity": number, "coverage": number, "rating": number, "explanation": "string"}
    `

    const response = await ai.models.generateContent({
      model: process.env.AI_MODEL || 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: prompt }
          ]
        }
      ],
      config: { responseMimeType: 'application/json' }
    })

    const result = JSON.parse(response.text ?? '{}')
    const rating = Math.max(1, Math.min(5, Number(result.rating || 0)))
    const passed = rating >= 3.0

    // 3. Save note if rating is >= 3.0
    if (passed) {
      await Note.create({
        title,
        ownerEmail: (req as any).user.email,
        subjectCode,
        unitId: Number(unitId),
        rating,
        readability: result.readability,
        handwriting: result.handwriting,
        clarity: result.clarity,
        coverage: result.coverage,
        explanation: result.explanation,
        pdfBase64
      })

      // Unlock notes library for this user
      await User.findByIdAndUpdate((req as any).user.sub, { notesUnlocked: true })
    }

    res.json({ ...result, rating, passed })
  } catch (error) { next(error) }
})

// --- NOTES & PAPERS ACCESS ---
app.get('/api/notes/:subjectCode/:unitId', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById((req as any).user.sub)
    if (!user?.notesUnlocked && user?.role !== 'admin') {
      return res.status(403).json({ error: 'Notes library is locked. Upload 1 quality note to unlock.' })
    }
    const notesList = await Note.find({ subjectCode: req.params.subjectCode, unitId: Number(req.params.unitId) })
      .select('-pdfBase64')
      .sort({ rating: -1 })
    res.json(notesList)
  } catch (error) { next(error) }
})

app.get('/api/note/file/:id', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById((req as any).user.sub)
    if (!user?.notesUnlocked && user?.role !== 'admin') {
      return res.status(403).json({ error: 'Locked.' })
    }
    const note = await Note.findById(req.params.id)
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    res.json({ pdfBase64: note.pdfBase64, title: note.title })
  } catch (error) { next(error) }
})

app.get('/api/papers/:subjectCode/:unitId/:type', authMiddleware, async (req, res, next) => {
  try {
    const papers = await Paper.find({
      subjectCode: req.params.subjectCode,
      unitId: Number(req.params.unitId),
      type: req.params.type
    }).select('-pdfBase64')
    res.json(papers)
  } catch (error) { next(error) }
})

// Papers are open academic material: any signed-in student may open them.
app.get('/api/paper/file/:id', authMiddleware, async (req, res, next) => {
  try {
    const paper = await Paper.findById(req.params.id)
    if (!paper) return res.status(404).json({ error: 'Paper not found.' })
    res.json({ pdfBase64: paper.pdfBase64, title: paper.title })
  } catch (error) { next(error) }
})

app.post('/api/papers', authMiddleware, async (req, res, next) => {
  try {
    const { type, title, subjectCode, unitId, pdfBase64 } = req.body
    if (!['Sessional papers', 'Previous papers'].includes(type) || !title || !subjectCode || !unitId || !pdfBase64) {
      return res.status(400).json({ error: 'Provide a valid paper type, title, subject, unit, and PDF.' })
    }
    const paper = await Paper.create({ type, title, subjectCode, unitId: Number(unitId), pdfBase64 })
    res.json(paper)
  } catch (error) { next(error) }
})

// --- AI STUDY NOTES GENERATION ---
app.post('/api/ai/generate-notes', authMiddleware, async (req, res, next) => {
  try {
    const { subjectCode, unitId } = req.body
    const syllabusRecord = await Syllabus.findOne({ subjectCode, unitId: Number(unitId) })
    const topics = syllabusRecord?.topics ?? ['General unit concepts']

    const prompt = `Generate clear, high-yield structured revision study notes with key points and definitions based on these syllabus topics: ${JSON.stringify(topics)}.`
    const response = await ai.models.generateContent({
      model: process.env.AI_MODEL || 'gemini-1.5-flash',
      contents: prompt
    })

    res.json({ generatedNotes: response.text })
  } catch (error) { next(error) }
})

// --- ADMIN SYLLABUS MANAGEMENT ---
app.get('/api/admin/syllabus/:subjectCode/:unitId', authMiddleware, async (req, res, next) => {
  try {
    const syllabus = await Syllabus.findOne({ subjectCode: req.params.subjectCode, unitId: Number(req.params.unitId) })
    res.json(syllabus ?? { topics: [] })
  } catch (error) { next(error) }
})

app.post('/api/admin/syllabus', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
    const { subjectCode, unitId, topics, pdfBase64 } = req.body
    const subject = await Subject.findOne({ code: subjectCode })
    if (!subject || !subject.units.some(unit => unit.unitId === Number(unitId))) {
      return res.status(400).json({ error: 'Choose an existing subject and one of its five units.' })
    }
    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'Add at least one syllabus topic.' })
    }
    const doc = await Syllabus.findOneAndUpdate(
      { subjectCode, unitId: Number(unitId) },
      { topics, pdfBase64 },
      { upsert: true, new: true }
    )
    res.json(doc)
  } catch (error) { next(error) }
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(500).json({ error: 'Server error. Check server logs.' })
})

// --- SEED SEED DATA & START SERVER ---
const seedDefaultData = async () => {
  await Subject.updateMany(
    { course: { $exists: false } },
    { $set: { course: 'B.Tech' } }
  )
  const count = await Subject.countDocuments()
  if (count === 0) {
    await Subject.create([
      {
        name: 'Data Structures',
        code: 'KCS-301',
        course: 'B.Tech',
        year: '2nd Year',
        branch: 'Computer Science & Engineering',
        units: [
          { unitId: 1, title: 'Foundation & Arrays', topics: ['Algorithm analysis', 'Arrays and strings', 'Linked lists'] },
          { unitId: 2, title: 'Stacks & Queues', topics: ['Stack applications', 'Circular queues', 'Expression evaluation'] },
          { unitId: 3, title: 'Trees', topics: ['Binary trees', 'BST operations', 'AVL trees'] },
          { unitId: 4, title: 'Graphs', topics: ['Graph representation', 'BFS and DFS', 'Shortest paths'] },
          { unitId: 5, title: 'Sorting & Hashing', topics: ['Sorting algorithms', 'Hash tables', 'Collision handling'] }
        ]
      }
    ])
  }

  const thirdYearCseSubjects = [
    { name: 'Design and Analysis of Algorithms', code: 'KCS-501' },
    { name: 'Database Management Systems', code: 'KCS-502' },
    { name: 'Object-Oriented Software Design', code: 'KCS-503' },
    { name: 'Web Technology', code: 'KCS-504' }
  ]

  for (const subject of thirdYearCseSubjects) {
    await Subject.updateOne(
      { code: subject.code },
      {
        $setOnInsert: {
          ...subject,
          course: 'B.Tech',
          year: '3rd Year',
          branch: 'Computer Science & Engineering',
          units: [1, 2, 3, 4, 5].map(unitId => ({ unitId, title: `Unit ${unitId}`, topics: [] }))
        }
      },
      { upsert: true }
    )
  }
}


mongoose.connect(env('MONGODB_URI')).then(async () => {
  await seedDefaultData()
  await transport.verify().catch(() => console.log('SMTP verification check complete.'))
  app.listen(Number(process.env.PORT ?? 3001), () => console.log(`ABES Academic Portal API active on port ${process.env.PORT ?? 3001}`))
}).catch(error => { console.error('Startup failed:', error); process.exit(1) })


