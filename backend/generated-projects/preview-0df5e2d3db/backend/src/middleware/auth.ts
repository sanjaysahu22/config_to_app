import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'fallback_secret') as {
      userId: string
      role:   string
    }
    req.userId   = payload.userId
    req.userRole = payload.role
    next()
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' })
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? 'fallback_secret') as {
        userId: string; role: string
      }
      req.userId   = payload.userId
      req.userRole = payload.role
    } catch { /* no-op */ }
  }
  next()
}
