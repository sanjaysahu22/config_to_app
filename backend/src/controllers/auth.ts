import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db';
import { AuthRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  bio: z.string().optional(),
});

export const register = async (req: Request, res: Response) => {
  try {
    const validated = registerSchema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({ error: validated.error.flatten() });
    
    const { email, password, name } = validated.data;
    
    const existUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existUser.rowCount && existUser.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
      [email, hash, name]
    );
    
    const user = rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const validated = loginSchema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({ error: validated.error.flatten() });
    
    const { email, password } = validated.data;
    
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log in' });
  }
};

export const oauthMethod = async (req: Request, res: Response) => {
  // Stub for OAuth integration
  res.json({ message: 'OAuth endpoint reachable. Integration pending.' });
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const validated = updateProfileSchema.safeParse(req.body);
  if (!validated.success || !userId) return res.status(400).json({ error: 'Invalid request' });
  
  try {
    const { name, bio } = validated.data;
    // update query here, ignoring bio if not in DB schema yet for simplicity
    const { rows } = await pool.query(
      'UPDATE users SET name = COALESCE($1, name) WHERE id = $2 RETURNING id, email, name, role',
      [name, userId]
    );
    res.json({ user: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};
