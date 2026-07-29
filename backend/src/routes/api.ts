import { Router } from 'express';
import { login, register, oauthMethod, updateProfile } from '../controllers/auth';
import { requireAuth } from '../middleware/auth';
import { generateByConfig, generateByPrompt, getAllConfigs, getConfigById } from '../controllers/configs';
import runnerRouter from './runner'
const router = Router();

// Authentication
router.post('/login', login);
router.post('/register', register);
router.post('/oauth', oauthMethod);

// Protected Auth Routes
router.patch('/profile', requireAuth, updateProfile);

// Business Generation Routes
router.post('/generatebyConfig', requireAuth, generateByConfig as any);

router.use('/runner', runnerRouter)
router.post('/generatebyprompt', requireAuth, generateByPrompt as any);
router.get('/configs', requireAuth, getAllConfigs as any);
router.get('/configs/:id', requireAuth, getConfigById as any);

// Public config/ping route for frontend wakeup
router.get('/config', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is awake' });
});

export default router;
