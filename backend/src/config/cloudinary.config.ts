import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger';

/**
 * Cloudinary Configuration
 * Handles file storage for uploaded documents (PDF, DOCX, TXT)
 * 
 * Configuration Options:
 * 1. CLOUDINARY_URL (Recommended): Single environment variable
 *    Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
 * 
 * 2. Individual variables (Alternative):
 *    - CLOUDINARY_CLOUD_NAME
 *    - CLOUDINARY_API_KEY
 *    - CLOUDINARY_API_SECRET
 */

// Configure Cloudinary
// Supports both CLOUDINARY_URL (official format) and individual env vars
if (process.env.CLOUDINARY_URL) {
  // Official Cloudinary URL format (recommended)
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL,
    secure: true,
  });
  logger.info('Cloudinary configured using CLOUDINARY_URL');
} else {
  // Individual environment variables (alternative)
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('Cloudinary configured using individual environment variables');
}

/**
 * Validate Cloudinary configuration
 */
export const validateCloudinaryConfig = (): boolean => {
  // Check if CLOUDINARY_URL is set (official format)
  if (process.env.CLOUDINARY_URL) {
    const urlPattern = /^cloudinary:\/\/\d+:[^@]+@[\w-]+$/;
    if (!urlPattern.test(process.env.CLOUDINARY_URL)) {
      logger.error('Invalid CLOUDINARY_URL format. Expected: cloudinary://<api_key>:<api_secret>@<cloud_name>');
      return false;
    }
    logger.info('Cloudinary configuration validated successfully (using CLOUDINARY_URL)');
    return true;
  }
  
  // Check individual environment variables (alternative)
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  
  if (!cloud_name || !api_key || !api_secret) {
    logger.error('Cloudinary configuration missing. Please set either:\n' +
      '  1. CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> (Recommended)\n' +
      '  OR\n' +
      '  2. CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
    return false;
  }
  
  logger.info('Cloudinary configuration validated successfully (using individual variables)');
  return true;
};

/**
 * Upload file to Cloudinary
 * @param filePath - Local file path
 * @param folder - Cloudinary folder name (e.g., 'documents', 'pdfs')
 * @param resourceType - Type of resource ('raw' for documents, 'image', 'video')
 * @returns Upload result with secure URL and public ID
 */
export const uploadToCloudinary = async (
  filePath: string,
  folder: string = 'study-buddy/documents',
  resourceType: 'raw' | 'image' | 'video' = 'raw'
): Promise<{
  secure_url: string;
  public_id: string;
  resource_type: string;
  format: string;
  bytes: number;
  created_at: string;
}> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
    });

    logger.info(`File uploaded to Cloudinary: ${result.public_id}`);

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      created_at: result.created_at,
    };
  } catch (error) {
    logger.error('Cloudinary upload failed:', error);
    throw new Error(`Failed to upload file to Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete file from Cloudinary
 * @param publicId - Cloudinary public ID
 * @param resourceType - Type of resource
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: 'raw' | 'image' | 'video' = 'raw'
): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    logger.info(`File deleted from Cloudinary: ${publicId}`);
  } catch (error) {
    logger.error('Cloudinary deletion failed:', error);
    throw new Error(`Failed to delete file from Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Enhanced delete function with retry mechanism and better error handling
 * @param publicId - Cloudinary public ID
 * @param resourceType - Type of resource
 * @param options - Delete options
 */
export const deleteFromCloudinaryWithRetry = async (
  publicId: string,
  resourceType: 'raw' | 'image' | 'video' = 'raw',
  options: {
    retries?: number;
    throwOnError?: boolean;
    logErrors?: boolean;
  } = {}
): Promise<{ success: boolean; error?: string; deleted?: boolean }> => {
  const { retries = 3, throwOnError = false, logErrors = true } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { 
        resource_type: resourceType 
      });
      
      const deleted = result.result === 'ok';
      
      if (logErrors || deleted) {
        logger.info(`Cloudinary file ${deleted ? 'deleted' : 'not found'}: ${publicId} (attempt ${attempt})`);
      }
      
      return { 
        success: true, 
        deleted: deleted 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (attempt === retries) {
        if (logErrors) {
          logger.error(`Cloudinary deletion failed after ${retries} attempts: ${publicId}`, error);
        }
        
        if (throwOnError) {
          throw new Error(`Failed to delete file from Cloudinary after ${retries} attempts: ${errorMessage}`);
        }
        
        return { 
          success: false, 
          error: errorMessage,
          deleted: false 
        };
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  return { success: false, error: 'Unexpected error', deleted: false };
};

/**
 * Mark file for soft deletion in Cloudinary by adding tags
 * @param publicId - Cloudinary public ID
 * @param resourceType - Type of resource
 * @param userId - User ID for tracking
 */
export const markForSoftDeletion = async (
  publicId: string,
  resourceType: 'raw' | 'image' | 'video' = 'raw',
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const tags = [
      'soft-deleted',
      `deleted-${new Date().toISOString().split('T')[0]}`,
      `user-${userId}`
    ];
    
    for (const tag of tags) {
      await cloudinary.uploader.add_tag(tag, [publicId], {
        resource_type: resourceType
      });
    }
    
    logger.info(`Cloudinary file marked for soft deletion: ${publicId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to mark Cloudinary file for soft deletion: ${publicId}`, error);
    return { success: false, error: errorMessage };
  }
};

/**
 * Bulk delete multiple files from Cloudinary
 * @param publicIds - Array of public IDs
 * @param resourceType - Type of resource
 */
export const bulkDeleteFromCloudinary = async (
  publicIds: string[],
  resourceType: 'raw' | 'image' | 'video' = 'raw'
): Promise<{
  success: boolean;
  results: Array<{ publicId: string; success: boolean; error?: string; deleted?: boolean }>;
  totalDeleted: number;
  totalFailed: number;
}> => {
  const results: Array<{ publicId: string; success: boolean; error?: string; deleted?: boolean }> = [];
  let totalDeleted = 0;
  let totalFailed = 0;

  for (const publicId of publicIds) {
    const result = await deleteFromCloudinaryWithRetry(publicId, resourceType, {
      retries: 2,
      throwOnError: false,
      logErrors: true
    });

    results.push({
      publicId,
      success: result.success,
      error: result.error,
      deleted: result.deleted
    });

    if (result.success && result.deleted) {
      totalDeleted++;
    } else {
      totalFailed++;
    }
  }

  logger.info(`Bulk Cloudinary deletion completed: ${totalDeleted} deleted, ${totalFailed} failed`);

  return {
    success: totalDeleted > 0,
    results,
    totalDeleted,
    totalFailed
  };
};

/**
 * Get file URL from Cloudinary
 * @param publicId - Cloudinary public ID
 * @param resourceType - Type of resource
 */
export const getCloudinaryUrl = (
  publicId: string,
  resourceType: 'raw' | 'image' | 'video' = 'raw'
): string => {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    secure: true,
  });
};

export { cloudinary };
