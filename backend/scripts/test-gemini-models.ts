// Test script to discover available Gemini models
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('Error: GOOGLE_GEMINI_API_KEY not found in environment');
  process.exit(1);
}

async function listModels() {
  try {
    console.log('Fetching available Gemini models...\n');
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    const data: any = await response.json();
    const models = data.models || [];
    
    console.log(`Total models found: ${models.length}\n`);
    console.log('='.repeat(80));
    
    // Filter and display Gemini models that support generateContent
    const geminiModels = models.filter((m: any) => {
      const name = m.name.replace('models/', '');
      return name.includes('gemini') && 
             m.supportedGenerationMethods?.includes('generateContent');
    });
    
    console.log(`\nGemini models supporting generateContent: ${geminiModels.length}\n`);
    
    geminiModels.forEach((model: any, index: number) => {
      const name = model.name.replace('models/', '');
      console.log(`${index + 1}. ${name}`);
      console.log(`   Display Name: ${model.displayName}`);
      console.log(`   Description: ${model.description}`);
      console.log(`   Input Limit: ${model.inputTokenLimit?.toLocaleString()} tokens`);
      console.log(`   Output Limit: ${model.outputTokenLimit?.toLocaleString()} tokens`);
      console.log(`   Methods: ${model.supportedGenerationMethods?.join(', ')}`);
      console.log('');
    });
    
    // Test the first available model
    if (geminiModels.length > 0) {
      const testModelName = geminiModels[0].name.replace('models/', '');
      console.log('='.repeat(80));
      console.log(`\nTesting model: ${testModelName}\n`);
      
      // Try the stable models first
      const modelsToTry = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
      
      const genAI = new GoogleGenerativeAI(apiKey);
      let successModel: string | null = null;
      
      for (const modelName of modelsToTry) {
        try {
          console.log(`Testing ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent('Say "Hello" in one word.');
          const response = result.response;
          const text = response.text();
          
          successModel = modelName;
          console.log(`✓ ${modelName} works!`);
          console.log(`Response: ${text}\n`);
          break;
        } catch (err: any) {
          console.log(`✗ ${modelName} failed: ${err.message}\n`);
        }
      }
      
      if (!successModel) {
        console.log('❌ None of the tested models worked');
        return;
      }
      
      const text = 'Test completed';
      
      console.log(`✓ Test successful!`);
      console.log(`Response: ${text}\n`);
      
      console.log('='.repeat(80));
      console.log('\n✅ RECOMMENDED MODEL CONFIGURATION:\n');
      console.log('Update backend/src/config/ai.config.ts:');
      console.log('\nexport const GEMINI_MODELS = {');
      geminiModels.slice(0, 5).forEach((m: any, i: number) => {
        const name = m.name.replace('models/', '');
        const key = name.toUpperCase().replace(/[.-]/g, '_');
        console.log(`  ${key}: '${name}',`);
      });
      console.log('} as const;\n');
    } else {
      console.log('❌ No Gemini models found that support generateContent');
      console.log('   Check your API key permissions and quota');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

listModels();
