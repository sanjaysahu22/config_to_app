import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { pool } from '../db'

const router = Router()

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1).optional(),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string(),
})

// ── Ensure users table exists ────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT UNIQUE NOT NULL,
    password     TEXT NOT NULL,
    name         TEXT,
    role         TEXT NOT NULL DEFAULT 'user',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(console.error)

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  const { email, password, name } = parsed.data
  try {
    const hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
      [email, hash, name ?? null]
    )
    const user  = rows[0]
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET ?? 'fallback_secret', { expiresIn: '7d' })
    res.status(201).json({ user, token })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' })
    res.status(500).json({ error: 'Registration failed' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  const { email, password } = parsed.data
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET ?? 'fallback_secret', { expiresIn: '7d' })
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token })
  } catch {
    res.status(500).json({ error: 'Login failed' })
  }
})

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const { userId } = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? 'fallback_secret') as { userId: string }
    const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [userId])
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
