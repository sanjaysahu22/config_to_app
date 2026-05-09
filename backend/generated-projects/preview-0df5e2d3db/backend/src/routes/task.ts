import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

// ── Validation schema ────────────────────────────────────────────────────────
const createTaskSchema = z.object({
  title: z.string(),
  status: z.string(),
  createdAt: z.string()
})

const updateTaskSchema = createTaskSchema.partial()

// ── TypeScript type ──────────────────────────────────────────────────────────
interface TaskBody {
    title: string
    status: string
    createdAt: string
}

// ── GET /api/task  — list all (paginated, filtered) ───────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
    const offset = (page - 1) * limit

    // optional search
    const search = req.query.search as string | undefined

    let where = ''
    const params: unknown[] = [limit, offset]
    if (search) {
      const searchCols = ["title","status"]
      if (searchCols.length > 0) {
        const conds = searchCols.map((col: string) => `${col} ILIKE $${params.length + 1}`)
        where = 'WHERE ' + conds.join(' OR ')
        params.push(`%${search}%`)
      }
    }

    const [dataRes, countRes] = await Promise.all([
      pool.query(`SELECT * FROM task ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM task ${where}`, search ? [params[2]] : []),
    ])

    const total = parseInt(countRes.rows[0].count)
    res.json({
      data:  dataRes.rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('GET /task error:', err)
    res.status(500).json({ error: 'Failed to fetch task' })
  }
})

// ── GET /api/task/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM task WHERE id = $1`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Task not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('GET /task/:id error:', err)
    res.status(500).json({ error: 'Failed to fetch Task' })
  }
})

// ── POST /api/task ────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  const { title, status, createdAt } = parsed.data as TaskBody
  try {
    const { rows } = await pool.query(
      `INSERT INTO task (title, status, createdAt) VALUES ($1, $2, $3) RETURNING *`,
      [title, status, createdAt]
    )
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value — record already exists' })
    console.error('POST /task error:', err)
    res.status(500).json({ error: 'Failed to create Task' })
  }
})

// ── PUT /api/task/:id ─────────────────────────────────────────────────────
router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = updateTaskSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  // only update fields that were sent
  const updates = Object.entries(parsed.data).filter(([_, v]) => v !== undefined)
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  const setClause  = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values     = [...updates.map(([_, v]) => v), req.params.id]
  const idPosition = updates.length + 1

  try {
    const { rows } = await pool.query(
      `UPDATE task SET ${setClause} WHERE id = $${idPosition} RETURNING *`,
      values
    )
    if (!rows[0]) return res.status(404).json({ error: 'Task not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('PUT /task/:id error:', err)
    res.status(500).json({ error: 'Failed to update Task' })
  }
})

// ── DELETE /api/task/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM task WHERE id = $1 RETURNING id`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Task not found' })
    res.json({ deleted: true, id: rows[0].id })
  } catch (err) {
    console.error('DELETE /task/:id error:', err)
    res.status(500).json({ error: 'Failed to delete Task' })
  }
})

export default router
