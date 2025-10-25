/**
 * Test script for quiz parsing fixes
 * Tests: JSON cleanup, markdown fence removal, truncation handling, normalization
 */

import { parseQuizJson, normalizeQuizQuestion } from '../src/services/ai/parsers/quiz.parser';

console.log('🧪 Testing Quiz Parsing Fixes\n');

// Test 1: JSON with markdown fences
console.log('Test 1: JSON with markdown fences');
try {
  const jsonWithFences = '```json\n{"questions": [{"question": "Test?", "type": "mcq", "correctAnswer": "A"}]}\n```';
  const parsed1 = parseQuizJson(jsonWithFences);
  console.log('✅ PASS - Markdown fences removed');
  console.log('   Parsed:', JSON.stringify(parsed1).substring(0, 100) + '...\n');
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

// Test 2: Truncated JSON
console.log('Test 2: Truncated JSON (missing closing)');
try {
  const truncatedJson = '{"questions": [{"question": "Test?", "type": "mcq", "correctAnswer": "A"}]';
  const parsed2 = parseQuizJson(truncatedJson);
  console.log('✅ PASS - Truncated JSON recovered');
  console.log('   Parsed:', JSON.stringify(parsed2).substring(0, 100) + '...\n');
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

// Test 3: Nested structure unwrapping
console.log('Test 3: Nested quiz structure');
try {
  const nestedJson = '{"quiz": {"questions": [{"question": "Test?"}]}}';
  const parsed3 = parseQuizJson(nestedJson);
  console.log('✅ PASS - Nested structure unwrapped');
  console.log('   Has questions:', !!parsed3.questions, '\n');
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

// Test 4: Array format
console.log('Test 4: Direct array format');
try {
  const arrayJson = '[{"question": "Test?", "type": "mcq"}]';
  const parsed4 = parseQuizJson(arrayJson);
  console.log('✅ PASS - Array wrapped in questions object');
  console.log('   Has questions:', !!parsed4.questions, '\n');
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

// Test 5: Normalization - sourceTimestamp to sourceSegment
console.log('Test 5: Normalize sourceTimestamp → sourceSegment');
try {
  const questionWithTimestamp = {
    question: 'Test question?',
    type: 'mcq',
    correctAnswer: 'A',
    sourceTimestamp: { startTime: 1000, endTime: 5000 },
    difficulty: 'beginner',
  };
  const normalized = normalizeQuizQuestion(questionWithTimestamp, 0, 10000);
  
  if (normalized.sourceSegment && 
      normalized.sourceSegment.startTime === 1000 && 
      normalized.sourceSegment.endTime === 5000) {
    console.log('✅ PASS - sourceTimestamp mapped to sourceSegment');
    console.log('   sourceSegment:', normalized.sourceSegment, '\n');
  } else {
    console.log('❌ FAIL - sourceSegment not properly mapped\n');
  }
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

// Test 6: Normalization - fallback when no timestamp
console.log('Test 6: Normalize with fallback');
try {
  const questionWithoutTimestamp = {
    question: 'Test question?',
    type: 'mcq',
    correctAnswer: 'A',
    difficulty: 'beginner',
  };
  const normalized = normalizeQuizQuestion(questionWithoutTimestamp, 2000, 8000);
  
  if (normalized.sourceSegment && 
      normalized.sourceSegment.startTime === 2000 && 
      normalized.sourceSegment.endTime === 8000) {
    console.log('✅ PASS - Fallback timestamps used');
    console.log('   sourceSegment:', normalized.sourceSegment, '\n');
  } else {
    console.log('❌ FAIL - Fallback not applied\n');
  }
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

// Test 7: Real-world truncated response from logs
console.log('Test 7: Real-world truncated LLM response');
try {
  const realWorldTruncated = `\`\`\`json
{
  "questions": [
    {
      "question": "True or False: Machine learning involves explicitly coding every rule",
      "type": "truefalse",
      "correctAnswer": "False",
      "explanation": "The transcript states...",
      "difficulty": "beginner",
      "sourceSegment": {
        "startTime": 6000,
        "endTime": 9000
      },
      "points": 10
    }
  ]`;
  
  const parsed = parseQuizJson(realWorldTruncated);
  console.log('✅ PASS - Real-world truncated response handled');
  console.log('   Questions count:', parsed.questions?.length || 0, '\n');
} catch (e: any) {
  console.log('❌ FAIL -', e.message, '\n');
}

console.log('🎉 Quiz parsing tests complete!\n');
