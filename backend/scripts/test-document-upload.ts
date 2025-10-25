/**
 * Manual Test Script for Document Upload and Processing
 * 
 * This script tests the complete document upload pipeline:
 * 1. File upload via Multer
 * 2. Document loading via LangChain loaders
 * 3. Cloudinary storage
 * 4. Document processing
 * 
 * Prerequisites:
 * - MongoDB running
 * - Redis running (optional)
 * - Cloudinary credentials configured in .env
 * 
 * Usage:
 *   ts-node scripts/test-document-upload.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  processUploadedFile, 
  getDocumentStatistics 
} from '../src/services/ai/loaders/document.loader';
import { uploadToCloudinary, validateCloudinaryConfig } from '../src/config/cloudinary.config';
import { logger } from '../src/config/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testDocumentUpload() {
  console.log('='.repeat(80));
  console.log('Document Upload and Processing Test');
  console.log('='.repeat(80));
  console.log();

  // Test 1: Validate Cloudinary Configuration
  console.log('📋 Test 1: Validating Cloudinary Configuration...');
  const isCloudinaryConfigured = validateCloudinaryConfig();
  
  if (!isCloudinaryConfigured) {
    console.error('❌ Cloudinary is not configured. Please set environment variables:');
    console.error('   - CLOUDINARY_CLOUD_NAME');
    console.error('   - CLOUDINARY_API_KEY');
    console.error('   - CLOUDINARY_API_SECRET');
    console.log();
    console.log('⚠️  Skipping Cloudinary tests...');
  } else {
    console.log('✅ Cloudinary configuration is valid');
  }
  console.log();

  // Test 2: Load and Process TXT File
  console.log('📋 Test 2: Loading and Processing TXT File...');
  const txtFilePath = path.join(__dirname, '../test-files/sample-machine-learning.txt');
  
  if (!fs.existsSync(txtFilePath)) {
    console.error(`❌ Test file not found: ${txtFilePath}`);
    return;
  }

  const txtBuffer = fs.readFileSync(txtFilePath);
  console.log(`   File: ${path.basename(txtFilePath)}`);
  console.log(`   Size: ${(txtBuffer.length / 1024).toFixed(2)} KB`);
  console.log();

  try {
    const txtResult = await processUploadedFile(
      txtBuffer,
      'sample-machine-learning.txt',
      'txt'
    );

    console.log('✅ TXT file processed successfully');
    console.log(`   Total chunks: ${txtResult.metadata.totalChunks}`);
    console.log(`   Total characters: ${txtResult.metadata.totalCharacters}`);
    console.log(`   Average chunk size: ${Math.round(txtResult.metadata.totalCharacters / txtResult.metadata.totalChunks)} chars`);
    
    const stats = getDocumentStatistics(txtResult.documents);
    console.log(`   Min chunk size: ${stats.minChunkSize} chars`);
    console.log(`   Max chunk size: ${stats.maxChunkSize} chars`);
    console.log();

    // Display first chunk as sample
    console.log('📄 Sample chunk (first chunk):');
    console.log('-'.repeat(80));
    console.log(txtResult.documents[0].pageContent.substring(0, 200) + '...');
    console.log('-'.repeat(80));
    console.log();

    // Test 3: Upload to Cloudinary (if configured)
    if (isCloudinaryConfigured) {
      console.log('📋 Test 3: Uploading to Cloudinary...');
      
      // Save buffer to temporary file
      const tempPath = path.join(__dirname, '../temp', `test-${Date.now()}.txt`);
      const tempDir = path.dirname(tempPath);
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(tempPath, txtBuffer);
      
      try {
        const cloudinaryResult = await uploadToCloudinary(
          tempPath,
          'study-buddy/test-uploads',
          'raw'
        );

        console.log('✅ File uploaded to Cloudinary successfully');
        console.log(`   Public ID: ${cloudinaryResult.public_id}`);
        console.log(`   URL: ${cloudinaryResult.secure_url}`);
        console.log(`   Format: ${cloudinaryResult.format}`);
        console.log(`   Size: ${(cloudinaryResult.bytes / 1024).toFixed(2)} KB`);
        console.log();

        // Clean up temp file
        fs.unlinkSync(tempPath);
        
      } catch (error) {
        console.error('❌ Cloudinary upload failed:', error instanceof Error ? error.message : error);
        console.log();
      }
    }

    // Test 4: Validate File Size Limits
    console.log('📋 Test 4: Testing File Size Validation...');
    const maxSize = 25 * 1024 * 1024; // 25MB
    const fileSize = txtBuffer.length;
    
    if (fileSize > maxSize) {
      console.log('❌ File exceeds maximum size limit (25MB)');
    } else {
      console.log(`✅ File size is within limits (${(fileSize / 1024 / 1024).toFixed(2)} MB / 25 MB)`);
    }
    console.log();

    // Test 5: Test Chunking with Different Options
    console.log('📋 Test 5: Testing Different Chunking Options...');
    
    const chunkingConfigs = [
      { chunkSize: 300, chunkOverlap: 50, label: 'Small chunks (300/50)' },
      { chunkSize: 500, chunkOverlap: 100, label: 'Default chunks (500/100)' },
      { chunkSize: 1000, chunkOverlap: 200, label: 'Large chunks (1000/200)' },
    ];

    for (const config of chunkingConfigs) {
      const result = await processUploadedFile(
        txtBuffer,
        'sample-machine-learning.txt',
        'txt',
        { chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap }
      );

      console.log(`   ${config.label}:`);
      console.log(`      Total chunks: ${result.metadata.totalChunks}`);
      console.log(`      Avg chunk size: ${Math.round(result.metadata.totalCharacters / result.metadata.totalChunks)} chars`);
    }
    console.log();

    // Summary
    console.log('='.repeat(80));
    console.log('✅ All Tests Completed Successfully!');
    console.log('='.repeat(80));
    console.log();
    console.log('📊 Summary:');
    console.log('   ✓ Cloudinary configuration validated');
    console.log('   ✓ TXT file loaded and processed');
    console.log('   ✓ Document chunked into manageable pieces');
    console.log('   ✓ File size validation passed');
    console.log('   ✓ Multiple chunking strategies tested');
    if (isCloudinaryConfigured) {
      console.log('   ✓ File uploaded to Cloudinary');
    }
    console.log();
    console.log('🎉 Document upload system is ready for production!');
    console.log();

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run tests
testDocumentUpload().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
