// Auto-generated database types
// Do not edit manually — regenerate from config

// ── Task ──────────────────────────────────────────
export interface Task {
  id:         string
  title:           string
  status:          string
  createdAt:       Date
  created_at: Date
  updated_at: Date
}

export interface CreateTaskInput {
  title:           string
}

export interface UpdateTaskInput {
  title?:          string
  status?:         string
  createdAt?:      Date
}

export interface TaskListResponse {
  data:  Task[]
  meta:  { total: number; page: number; limit: number; totalPages: number }
}
