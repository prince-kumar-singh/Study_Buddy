import { Router } from 'express';

const router = Router();

router.get('/progress', async (req, res, next) => {
  res.status(501).json({ success: false, error: { message: 'Not implemented yet' } });
});

router.get('/stats', async (req, res, next) => {
  res.status(501).json({ success: false, error: { message: 'Not implemented yet' } });
});

export default router;
