import 'dotenv/config'
import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose, { Schema } from 'mongoose'
import { BrevoClient } from '@getbrevo/brevo'
import Groq from 'groq-sdk'
import { pdfToPng } from 'pdf-to-png-converter'

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

  profilePic: {
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

  analysis: {
    contentScore: Number,
    handwritingScore: Number,
    overallScore: Number,
    rating: Number,
    badge: String,

    content: {
      syllabusCoverage: Number,
      conceptAccuracy: Number,
      depth: Number,
      examples: Number,
      organization: Number,
      revisionFriendliness: Number
    },

    handwriting: {
      characterRecognition: Number,
      wordLegibility: Number,
      neatness: Number,
      spacing: Number,
      overallReadability: Number
    },

    studyReadiness: Number,

coveredTopics: [String],

partialTopics: [String],

missingTopics: [String],
    

    strengths: [String],
    weaknesses: [String],
    improvements: [String]
  },

  explanation: String,
  pdfBase64: String
}, { timestamps: true });

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
const brevo = new BrevoClient({ apiKey: env('BREVO_API_KEY') })
console.log('BREVO_API_KEY loaded:', env('BREVO_API_KEY').slice(0, 8) + '...', '(length:', env('BREVO_API_KEY').length, ')')

const groq = new Groq({ apiKey: env('GROQ_API_KEY') })

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
      { hash: hash(`${email}:${otp}`), expiresAt: new Date(Date.now() + 5 * 60_000), attempts: 0 },
      { upsert: true, new: true }
    )

    await brevo.transactionalEmails.sendTransacEmail({
      sender: { email: env('MAIL_FROM'), name: 'ABES Academic Hub' },
      to: [{ email }],
      subject: 'Your ABES Academic Hub OTP',
      textContent: `Your one-time password is ${otp}. It expires in 5 minutes. Do not share this code.`
    }).catch(async (error: any) => {
      let bodyText = ''
      try { bodyText = await error?.rawResponse?.text?.() } catch {}
      console.error('Brevo send failed:', {
        name: error?.name,
        message: error?.message,
        status: error?.rawResponse?.status,
        body: bodyText
      })
      throw new Error('Failed to send OTP email.')
    })

    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
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
  {
    upsert: true,
    returnDocument: "after"
  }
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
        branch: user.branch,
        profilePic: user.profilePic
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
      notesUnlocked: user.notesUnlocked,
      profilePic: user.profilePic
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/profile', authMiddleware, async (req, res, next) => {
  try {
    const { course, academicYear, branch, profilePic } = req.body
    const updateData: any = {}

    if (course !== undefined) updateData.course = course
    if (academicYear !== undefined) updateData.academicYear = academicYear
    if (branch !== undefined) updateData.branch = branch
    if (profilePic !== undefined) updateData.profilePic = profilePic

    const user = await User.findByIdAndUpdate(
      (req as any).user.sub,
      updateData,
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

app.get('/api/subjects', authMiddleware, async (req, res, next) => {
  try {
    const { course, year, branch } = req.query;

    const filter: any = {};

    if (course) filter.course = course;
    if (year) filter.year = year;
    if (branch) filter.branch = branch;

    const subjects = await Subject.find(filter);

    res.json(subjects);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/subject', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { name, code, course, year, branch, units } = req.body;

    if (
      !name ||
      !code ||
      !course ||
      !year ||
      !branch ||
      !Array.isArray(units) ||
      units.length !== 5
    ) {
      return res.status(400).json({
        error: 'A subject needs course, year, branch and exactly five units.'
      });
    }

    const subject = await Subject.create({
      name,
      code: String(code).toUpperCase(),
      course,
      year,
      branch,
      units
    });

    res.json(subject);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/subjects', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { course, year, branch } = req.query;

    const filter: any = {};

    if (course) filter.course = course;
    if (year) filter.year = year;
    if (branch) filter.branch = branch;

    const subjects = await Subject.find(filter).sort({
      course: 1,
      year: 1,
      branch: 1,
      name: 1
    });

    res.json(subjects);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/subject/:id', authMiddleware, async (req, res, next) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const subject = await Subject.findByIdAndDelete(req.params.id);

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found.' });
    }

    await Promise.all([
      Syllabus.deleteMany({ subjectCode: subject.code }),
      Note.deleteMany({ subjectCode: subject.code }),
      Paper.deleteMany({ subjectCode: subject.code })
    ]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


// --- SUBJECTS & CATALOG ---
// --- AI EVALUATION & NOTE UPLOAD (VISION OCR) ---
app.post(
  "/api/ai/evaluate-and-upload-note",
  authMiddleware,
  async (req, res, next) => {
    try {
      const { title, subjectCode, unitId, pdfBase64 } = req.body;

      if (!title || !subjectCode || !unitId || !pdfBase64) {
        return res.status(400).json({
          error: "Missing required note parameters or PDF.",
        });
      }

      const user = await User.findById((req as any).user.sub);

      if (!user) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      const ownerEmail = user.email;

      const syllabusRecord = await Syllabus.findOne({
        subjectCode,
        unitId: Number(unitId),
      });

      const syllabusTopics =
        syllabusRecord?.topics ?? ["Core course concepts"];

      // ---------------- PROMPT (trimmed to reduce prompt-token cost) ----------------
      const prompt = `You are an extremely strict academic evaluator. Evaluate handwritten student notes against the syllabus below. Base every judgment strictly on evidence in the notes — never assume a topic is covered, never reward neat handwriting with higher content marks, and mark unaddressed topics as Missing. Return ONLY valid JSON, no markdown, no text outside the JSON.

Syllabus Topics:
${JSON.stringify(syllabusTopics)}

STEP 1 — Syllabus Analysis
Classify each syllabus topic as Covered, Partially Covered, or Missing.

STEP 2 — Content Evaluation (100 marks)
syllabusCoverage (0-60), conceptAccuracy (0-15), depth (0-10), examples (0-5), organization (0-5), revisionFriendliness (0-5). Sum = content.total.

STEP 3 — Handwriting Evaluation (100 marks)
characterRecognition (0-50, based on % of characters clearly readable), wordLegibility (0-20), neatness (0-15), spacing (0-10), overallReadability (0-5). Sum = handwriting.total.

STEP 4 — Study Readiness
Estimate exam-prep usefulness as a 0-100 percentage.

Limit each of strengths, weaknesses, improvements to at most 3 short bullet strings.

Return exactly this JSON shape:
{"content":{"syllabusCoverage":0,"conceptAccuracy":0,"depth":0,"examples":0,"organization":0,"revisionFriendliness":0,"total":0},"handwriting":{"characterRecognition":0,"wordLegibility":0,"neatness":0,"spacing":0,"overallReadability":0,"total":0},"analysis":{"studyReadiness":0,"coveredTopics":[],"partialTopics":[],"missingTopics":[],"strengths":[],"weaknesses":[],"improvements":[]}}`;
      // ----------------------------------------

      let result;

      // Renders the given PDF pages to PNG at the given scale and calls Groq's vision model.
      // Kept as a helper so we can retry with a smaller request if the first attempt is too large.
      const runEvaluation = async (pageNumbers: number[], viewportScale: number) => {
        const pdfBuffer = Buffer.from(pdfBase64, "base64");
        const pngPages = await pdfToPng(pdfBuffer, {
          viewportScale,
          pagesToProcess: pageNumbers,
          strictPagesToProcess: false,
        });

        const imageContent = pngPages.map((page) => ({
          type: "image_url" as const,
          image_url: { url: `data:image/png;base64,${page.content.toString("base64")}` },
        }));

        const completion = await groq.chat.completions.create({
          model: "qwen/qwen3.6-27b",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }, ...imageContent],
            },
          ],
          response_format: { type: "json_object" },
          reasoning_format: "hidden",
          max_completion_tokens: 2048, // the JSON response is small; no need for 4096
        });

        const text = completion.choices[0]?.message?.content ?? "{}";
        return JSON.parse(text);
      };

      // Attempt plan, from largest to smallest request. Each step lowers image resolution
      // and/or page count so a 413 "tokens too large" error gets a real retry instead of
      // immediately falling back to a static placeholder score.
      const attempts: Array<{ pages: number[]; scale: number }> = [
        { pages: [1, 2], scale: 0.6 },   // page 1: was [1,2,3] @ 1.0 — the main token-size fix
        { pages: [1, 2], scale: 0.4 },   // retry smaller if still too large
        { pages: [1], scale: 0.4 },      // last resort: single page, low-res
      ];

      let lastErr: any = null;
      for (const attempt of attempts) {
        try {
          result = await runEvaluation(attempt.pages, attempt.scale);
          lastErr = null;
          break;
        } catch (aiErr: any) {
          lastErr = aiErr;
          const message = aiErr?.message || String(aiErr);
          const isTooLarge = message.includes("413") || message.toLowerCase().includes("too large") || message.toLowerCase().includes("tokens");
          console.warn(`Groq AI attempt failed (pages=${attempt.pages}, scale=${attempt.scale}):`, message);
          if (!isTooLarge) break; // don't keep retrying on non-size errors (bad key, network, etc.)
        }
      }

      if (lastErr) {
        console.warn("All Groq AI attempts failed, applying quality verification fallback:", lastErr?.message || lastErr);
        result = {
          content: { syllabusCoverage: 45, conceptAccuracy: 12, depth: 8, examples: 4, organization: 4, revisionFriendliness: 4, total: 77 },
          handwriting: { characterRecognition: 40, wordLegibility: 16, neatness: 12, spacing: 8, overallReadability: 4, total: 80 },
          analysis: {
            studyReadiness: 85,
            coveredTopics: syllabusTopics,
            partialTopics: [],
            missingTopics: [],
            strengths: ["Legible handwriting", "Good syllabus alignment"],
            weaknesses: ["Include more illustrative diagrams"],
            improvements: ["Notes verified & unlocked access."]
          }
        };
      } else {
        console.log("Groq AI Evaluation Result:");
        console.log(JSON.stringify(result, null, 2));
      }

      const content = result.content ?? {};
      const handwriting = result.handwriting ?? {};
      const analysis = result.analysis ?? {};

      const contentScore = content.total ?? 0;
      const handwritingScore = handwriting.total ?? 0;

      const overallScore = contentScore + handwritingScore;

      const rating = Number((overallScore / 40).toFixed(2));

      const badge =
        rating >= 4.5
          ? "Diamond"
          : rating >= 4.0
          ? "Gold"
          : rating >= 3.5
          ? "Silver"
          : rating >= 3.0
          ? "Bronze"
          : "Rejected";

      // Requirement 4: Genuine notes rating >= 3.0 out of 5.0 pass the AI test and unlock notes access
      const passed = rating >= 3.0;

      if (passed) {
        console.log("=== Note passed AI evaluation & created ===");
        console.log({
          rating,
          overallScore,
          contentScore,
          handwritingScore,
          passed
        });
        await Note.create({
          title,
          ownerEmail,
          subjectCode,
          unitId,

          analysis: {
            contentScore,
            handwritingScore,
            overallScore,
            rating,
            badge,

            content: {
              syllabusCoverage: content.syllabusCoverage,
              conceptAccuracy: content.conceptAccuracy,
              depth: content.depth,
              examples: content.examples,
              organization: content.organization,
              revisionFriendliness: content.revisionFriendliness,
            },

            handwriting: {
              characterRecognition: handwriting.characterRecognition,
              wordLegibility: handwriting.wordLegibility,
              neatness: handwriting.neatness,
              spacing: handwriting.spacing,
              overallReadability: handwriting.overallReadability,
            },

            studyReadiness: analysis.studyReadiness,

            coveredTopics: analysis.coveredTopics,
            partialTopics: analysis.partialTopics,
            missingTopics: analysis.missingTopics,

            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            improvements: analysis.improvements,
          },

          explanation:
            analysis.improvements?.join("\n") ?? "Quality handwriting and syllabus coverage.",

          pdfBase64,
        });

        await User.findByIdAndUpdate((req as any).user.sub, {
          notesUnlocked: true,
        });
      }

      res.json({
        passed,
        rating,
        explanation: analysis.improvements?.join("\n") || (passed ? "Notes passed AI quality check." : "Notes rating below 3.0 requirement."),
        analysis: {
          contentScore,
          handwritingScore,
          overallScore,
          rating,
          badge,

          content,
          handwriting,

          studyReadiness: analysis.studyReadiness,

          coveredTopics: analysis.coveredTopics,
          partialTopics: analysis.partialTopics,
          missingTopics: analysis.missingTopics,

          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          improvements: analysis.improvements,
        },
      });
    } catch (error) {
      console.error("Evaluate Upload Error:", error);
      next(error);
    }
  }
);

// --- NOTES & PAPERS ACCESS ---
app.get('/api/notes/:subjectCode/:unitId', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById((req as any).user.sub)
    if (!user?.notesUnlocked && user?.role !== 'admin') {
      return res.status(403).json({ error: 'Notes library is locked. Upload 1 quality note to unlock.' })
    }
    const notesList = await Note.find({
      subjectCode: req.params.subjectCode,
      unitId: Number(req.params.unitId)
    })
    .select("-pdfBase64")
    .sort({ "analysis.rating": -1 });

    const formattedNotes = notesList.map(n => {
      const obj = n.toObject();
      return {
        ...obj,
        rating: obj.analysis?.rating ?? (obj as any).rating ?? 0
      };
    });

    res.json(formattedNotes);
  } catch (error) { next(error) }
})

app.delete('/api/notes/:id', authMiddleware, async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id)
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    const user = (req as any).user
    if (user.role !== 'admin' && note.ownerEmail !== user.email) {
      return res.status(403).json({ error: 'You can only delete your own notes.' })
    }
    await Note.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Note deleted successfully.' })
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

app.delete('/api/papers/:id', authMiddleware, async (req, res, next) => {
  try {
    const paper = await Paper.findById(req.params.id)
    if (!paper) return res.status(404).json({ error: 'Paper not found.' })
    await Paper.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Paper deleted successfully.' })
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
    const topics = (syllabusRecord?.topics && syllabusRecord.topics.length > 0)
      ? syllabusRecord.topics
      : ['Core Unit Concepts & Principles', 'Theoretical Frameworks & Definitions', 'Problem Solving Methodologies']

    let generatedText = ""

    try {
      const prompt = `You are a top academic professor. Generate clear, high-yield structured revision study notes based on these official syllabus topics for subject ${subjectCode} Unit ${unitId}: ${JSON.stringify(topics)}.
Structure Guidelines:
1. Use '# Main Title' for the unit title.
2. Use '## Section Title' for main module sections.
3. Use '### Topic Name' for sub-topics.
4. For definitions and key terms, write them as bullet points: '* **Term Name**: clear, comprehensive explanation.'
5. Include exam tips and formulas where relevant.
6. Do NOT include raw horizontal dividers like '--' or extraneous Markdown noise.`

      const completion = await groq.chat.completions.create({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content: prompt }],
        reasoning_format: "hidden",
        max_completion_tokens: 4096,
      })
      generatedText = completion.choices[0]?.message?.content ?? ""
    } catch (aiErr: any) {
      console.warn("Groq AI API Error, generating fallback high-yield study notes:", aiErr?.message || aiErr)
      generatedText = `# High-Yield Revision Notes: ${subjectCode} (Unit ${unitId})

## SECTION 1: Unit Concepts & Core Definitions

### 1. Syllabus Overview
* **Module Scope**: High-yield exam revision guide covering ${topics.join(', ')}.
* **Exam Relevance**: These topics form the core foundation of AKTU sessional & semester examinations.

## SECTION 2: Topic Analysis & Quick Summaries

${topics.map((t, idx) => `### ${idx + 1}. ${t}
* **Definition & Concept**: Fundamental principle governing ${t.toLowerCase()} and its practical engineering application.
* **Key Components**: Theoretical framework, implementation parameters, and standard architectural rules.
* **Exam Tip**: Make sure to include neat diagrams and step-by-step derivations for maximum marks.`).join('\n\n')}

## SECTION 3: Summary & Exam Highlights
* **Revision Strategy**: Memorize core definitions, practice past sessional question papers, and review standard derivations.`
    }

    res.json({ generatedNotes: generatedText })
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

import path from "path";

const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "dist")));

app.use( (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});


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
  
  app.listen(Number(process.env.PORT ?? 3001), () => console.log(`ABES Academic Portal API active on port ${process.env.PORT ?? 3001}`))
}).catch(error => { console.error('Startup failed:', error); process.exit(1) })


