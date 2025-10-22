import { Router } from 'express';

const router = Router();

router.get('/:contentId', async (req, res, next) => {
  res.status(501).json({ success: false, error: { message: 'Not implemented yet' } });
});

router.put('/:id/review', async (req, res, next) => {
  res.status(501).json({ success: false, error: { message: 'Not implemented yet' } });
});

router.get('/due', async (req, res, next) => {
  res.status(501).json({ success: false, error: { message: 'Not implemented yet' } });
});

export default router;
