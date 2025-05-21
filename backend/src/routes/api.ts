import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { upload, imagineRequest } from '../controllers/imagineController';
import { getJobStatus, getJobHistory } from '../controllers/jobController';
import { handleWebhook } from '../controllers/webhookController';

const router = Router();

// Public routes
router.post('/webhook', handleWebhook);

// Protected routes
router.post('/imagine', requireAuth, upload.single('image'), imagineRequest);
router.get('/jobs/:jobId', requireAuth, getJobStatus);
router.get('/jobs', requireAuth, getJobHistory);

export default router;
