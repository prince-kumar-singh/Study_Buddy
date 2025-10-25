import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { Request } from 'express';
import { ApiError } from './error.middleware';

/**
 * File Upload Middleware using Multer
 * Handles document uploads (PDF, DOCX, TXT)
 * Max file size: 25MB per file
 * Max files: 5 per request
 */

// Allowed MIME types
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

// Max file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes

// Max number of files per upload
const MAX_FILES = 5;

/**
 * Multer storage configuration
 * Stores files temporarily in memory before uploading to Cloudinary
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate file types
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void => {
  // Check MIME type
  if (!Object.keys(ALLOWED_MIME_TYPES).includes(file.mimetype)) {
    const error = new ApiError(
      400,
      `Invalid file type: ${file.mimetype}. Allowed types: PDF, DOCX, TXT`
    );
    return callback(error as any);
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt'];
  
  if (!allowedExtensions.includes(ext)) {
    const error = new ApiError(
      400,
      `Invalid file extension: ${ext}. Allowed extensions: .pdf, .docx, .txt`
    );
    return callback(error as any);
  }

  callback(null, true);
};

/**
 * Multer upload configuration for single file
 */
export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
}).single('document');

/**
 * Multer upload configuration for multiple files
 * Max 5 files per request
 */
export const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
}).array('documents', MAX_FILES);

/**
 * Validate uploaded file
 * Additional validation after multer processing
 */
export const validateUploadedFile = (file: Express.Multer.File | undefined): void => {
  if (!file) {
    throw new ApiError(400, 'No file uploaded');
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new ApiError(
      400,
      `File size exceeds maximum allowed size of 25MB. File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
    );
  }

  // Check if buffer exists
  if (!file.buffer) {
    throw new ApiError(400, 'File buffer is missing');
  }
};

/**
 * Validate multiple uploaded files
 */
export const validateUploadedFiles = (files: Express.Multer.File[] | undefined): void => {
  if (!files || files.length === 0) {
    throw new ApiError(400, 'No files uploaded');
  }

  if (files.length > MAX_FILES) {
    throw new ApiError(400, `Maximum ${MAX_FILES} files allowed per upload`);
  }

  // Validate each file
  files.forEach((file, index) => {
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(
        400,
        `File ${index + 1} (${file.originalname}) exceeds maximum allowed size of 25MB`
      );
    }

    if (!file.buffer) {
      throw new ApiError(400, `File ${index + 1} (${file.originalname}) buffer is missing`);
    }
  });

  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxTotalSize = MAX_FILE_SIZE * MAX_FILES; // 125MB total
  
  if (totalSize > maxTotalSize) {
    throw new ApiError(
      400,
      `Total file size exceeds maximum allowed size of ${maxTotalSize / (1024 * 1024)}MB`
    );
  }
};

/**
 * Get file extension from mimetype
 */
export const getFileExtension = (mimetype: string): string => {
  return ALLOWED_MIME_TYPES[mimetype as keyof typeof ALLOWED_MIME_TYPES] || 'unknown';
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Export constants for use in other modules
export const FILE_UPLOAD_CONSTANTS = {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_FILE_SIZE_MB: MAX_FILE_SIZE / (1024 * 1024),
};
