import express from 'express'
import { quotaService } from '../services/quota.service'

const router = express.Router()

// Middleware to verify authentication (assuming you have an auth middleware)
// Adjust the import path based on your project structure
// import { authenticateToken } from '../middleware/auth.middleware'

/**
 * GET /api/quota/usage
 * Get comprehensive quota usage statistics for the authenticated user
 */
router.get('/usage', async (req, res) => {
  try {
    // @ts-ignore - user should be attached by auth middleware
    const userId = req.user?.id || req.user?._id

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      })
    }

    const usage = await quotaService.getQuotaUsage(userId.toString())
    const pausedCount = await quotaService.getPausedContentCount(userId.toString())

    res.json({
      success: true,
      data: {
        ...usage,
        pausedContent: pausedCount
      }
    })
  } catch (error: any) {
    console.error('Error fetching quota usage:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quota usage',
      error: error.message
    })
  }
})

/**
 * GET /api/quota/check
 * Check if user can make more API requests
 */
router.get('/check', async (req, res) => {
  try {
    // @ts-ignore - user should be attached by auth middleware
    const userId = req.user?.id || req.user?._id

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      })
    }

    const provider = (req.query.provider as string) || 'gemini'
    const check = await quotaService.canMakeRequest(userId.toString(), provider)

    res.json({
      success: true,
      data: check
    })
  } catch (error: any) {
    console.error('Error checking quota:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to check quota',
      error: error.message
    })
  }
})

/**
 * GET /api/quota/paused-content
 * Get count of paused content for the user
 */
router.get('/paused-content', async (req, res) => {
  try {
    // @ts-ignore - user should be attached by auth middleware
    const userId = req.user?.id || req.user?._id

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      })
    }

    const count = await quotaService.getPausedContentCount(userId.toString())

    res.json({
      success: true,
      data: {
        pausedCount: count
      }
    })
  } catch (error: any) {
    console.error('Error fetching paused content count:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch paused content count',
      error: error.message
    })
  }
})

export default router
