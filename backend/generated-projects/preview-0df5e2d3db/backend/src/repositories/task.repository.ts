// src/repositories/task.repository.ts
import { pool, query, paginate } from '../db'
import type { Task, CreateTaskInput, UpdateTaskInput, TaskListResponse } from '../types/db'

export const TaskRepository = {

  // ── list (paginated + optional search) ─────────────────────────────────
  async list(opts: {
    page?:   number
    limit?:  number
    search?: string
    where?:  Partial<Task>
  } = {}): Promise<TaskListResponse> {
    const { limit, offset, page } = paginate(opts.page ?? 1, opts.limit ?? 20)

    const conditions: string[] = ['1=1']
    const params: unknown[]    = []

    // dynamic WHERE from opts.where
    if (opts.where) {
      Object.entries(opts.where).forEach(([col, val]) => {
        if (val !== undefined) {
          params.push(val)
          conditions.push(`${col} = $${params.length}`)
        }
      })
    }

    // full-text search
    if (opts.search) {
      params.push(`%${opts.search}%`)
      const searchIdx = params.length
      conditions.push(`(${f.name} ILIKE $${searchIdx} OR ${f.name} ILIKE $${searchIdx})`)
    }

    const where = 'WHERE ' + conditions.join(' AND ')

    const [data, count] = await Promise.all([
      query<Task>(`SELECT * FROM task ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
      query<{ count: string }>(`SELECT COUNT(*) FROM task ${where}`, params),
    ])

    const total = parseInt(count[0]?.count ?? '0')
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  },

  // ── findById ────────────────────────────────────────────────────────────
  async findById(id: string): Promise<Task | null> {
    const rows = await query<Task>(`SELECT * FROM task WHERE id = $1`, [id])
    return rows[0] ?? null
  },

  // ── findOne (by field) ──────────────────────────────────────────────────
  async findOne(where: Partial<Task>): Promise<Task | null> {
    const entries = Object.entries(where).filter(([_, v]) => v !== undefined)
    if (entries.length === 0) return null
    const conds  = entries.map(([col], i) => `${col} = $${i + 1}`).join(' AND ')
    const params = entries.map(([_, v]) => v)
    const rows   = await query<Task>(`SELECT * FROM task WHERE ${conds} LIMIT 1`, params)
    return rows[0] ?? null
  },

  // ── create ──────────────────────────────────────────────────────────────
  async create(input: CreateTaskInput): Promise<Task> {
    const rows = await query<Task>(
      `INSERT INTO task (title) VALUES ($1) RETURNING *`,
      [input.title]
    )
    return rows[0]
  },

  // ── update ──────────────────────────────────────────────────────────────
  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const entries = Object.entries(input).filter(([_, v]) => v !== undefined)
    if (entries.length === 0) return this.findById(id)
    const sets   = entries.map(([col], i) => `${col} = $${i + 1}`).join(', ')
    const params = [...entries.map(([_, v]) => v), id]
    const rows   = await query<Task>(`UPDATE task SET ${sets} WHERE id = $${params.length} RETURNING *`, params)
    return rows[0] ?? null
  },

  // ── delete ──────────────────────────────────────────────────────────────
  async delete(id: string): Promise<boolean> {
    const rows = await query<{ id: string }>(`DELETE FROM task WHERE id = $1 RETURNING id`, [id])
    return rows.length > 0
  },

  // ── count ───────────────────────────────────────────────────────────────
  async count(where: Partial<Task> = {}): Promise<number> {
    const entries = Object.entries(where).filter(([_, v]) => v !== undefined)
    const conds   = entries.length
      ? 'WHERE ' + entries.map(([col], i) => `${col} = $${i + 1}`).join(' AND ')
      : ''
    const rows = await query<{ count: string }>(`SELECT COUNT(*) FROM task ${conds}`, entries.map(([_, v]) => v))
    return parseInt(rows[0]?.count ?? '0')
  },

} satisfies Record<string, (...args: any[]) => Promise<any>>
