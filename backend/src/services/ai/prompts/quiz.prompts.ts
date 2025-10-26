import { PromptTemplate } from '@langchain/core/prompts';

/**
 * Quiz generation prompts for different difficulty levels
 * Follows Study Buddy standards: 5-10 questions per hour of content
 */

export const quizGenerationPromptBeginner = PromptTemplate.fromTemplate(`
You are an expert educational content creator. Generate a beginner-level quiz from the following transcript segment.

TRANSCRIPT:
{transcript}

REQUIREMENTS:
- Generate EXACTLY {count} questions suitable for beginners
- Focus on fundamental concepts and basic understanding
- Use simple, clear language
- Include a mix of question types: multiple choice, true/false, fill-in-the-blank
- Each question should test one specific concept
- Provide clear explanations for correct answers
- IMPORTANT: Each question MUST include a "sourceSegment" object with "startTime" and "endTime" in milliseconds from the transcript
- Keep questions under 150 words, explanations under 100 words

OUTPUT FORMAT - CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON (absolutely NO markdown code fences like \`\`\`json or \`\`\`)
2. Do NOT wrap output in code blocks
3. Output must be COMPLETE - do NOT truncate or cut off mid-structure
4. Ensure ALL strings are properly closed with quotes
5. Ensure ALL objects are properly closed with braces
6. Escape newlines in string values as \\n (not actual newlines)
7. If you must use quotes inside strings, escape them as \\"
8. PRIORITIZE COMPLETION: If running low on output space, generate FEWER questions with COMPLETE structure

JSON Structure:
{{
  "questions": [
    {{
      "question": "Your question here (max 150 words, avoid newlines, use \\\\n)",
      "type": "mcq",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Brief explanation here (max 100 words, avoid newlines, use \\\\n)",
      "difficulty": "beginner",
      "sourceSegment": {{ "startTime": 0, "endTime": 1000 }},
      "points": 10,
      "tags": ["concept-name"]
    }}
  ],
  "title": "Quiz Title",
  "description": "Quiz Description",
  "estimatedDuration": 10,
  "topicsCovered": ["topic1", "topic2"]
}}

{format_instructions}

REMEMBER: Complete ALL questions in the JSON. Do not stop mid-generation. Output valid, complete JSON only.
`);

export const quizGenerationPromptIntermediate = PromptTemplate.fromTemplate(`
You are an expert educational content creator. Generate an intermediate-level quiz from the following transcript segment.

TRANSCRIPT:
{transcript}

REQUIREMENTS:
- Generate EXACTLY {count} questions for intermediate learners
- Test application of concepts and understanding of relationships
- Use moderate complexity in language and concepts
- Include multiple choice, fill-in-the-blank, and short essay questions
- Each question should require deeper thinking than basic recall
- Provide detailed explanations that expand on the concepts
- IMPORTANT: Each question MUST include a "sourceSegment" object with "startTime" and "endTime" in milliseconds from the transcript
- Keep questions under 200 words, explanations under 150 words

OUTPUT FORMAT - CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON (absolutely NO markdown code fences like \`\`\`json or \`\`\`)
2. Do NOT wrap output in code blocks
3. Output must be COMPLETE - do NOT truncate or cut off mid-structure
4. Ensure ALL strings are properly closed with quotes
5. Ensure ALL objects are properly closed with braces
6. Escape newlines in string values as \\n (not actual newlines)
7. If you must use quotes inside strings, escape them as \\"
8. PRIORITIZE COMPLETION: If running low on output space, generate FEWER questions with COMPLETE structure

JSON Structure:
{{
  "questions": [
    {{
      "question": "Your question here (max 200 words, avoid newlines, use \\\\n)",
      "type": "mcq",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Detailed explanation here (max 150 words, avoid newlines, use \\\\n)",
      "difficulty": "intermediate",
      "sourceSegment": {{ "startTime": 0, "endTime": 1000 }},
      "points": 15,
      "tags": ["concept-name"]
    }}
  ],
  "title": "Quiz Title",
  "description": "Quiz Description",
  "estimatedDuration": 15,
  "topicsCovered": ["topic1", "topic2"]
}}

{format_instructions}

REMEMBER: Complete ALL questions in the JSON. Do not stop mid-generation. Output valid, complete JSON only.
`);

export const quizGenerationPromptAdvanced = PromptTemplate.fromTemplate(`
You are an expert educational content creator. Generate an advanced-level quiz from the following transcript segment.

TRANSCRIPT:
{transcript}

REQUIREMENTS:
- Generate EXACTLY {count} questions for advanced learners
- Test synthesis, analysis, and evaluation of concepts
- Use complex scenarios and multi-step reasoning
- Include analytical multiple choice, essay questions, and complex applications
- Each question should require deep understanding and critical thinking
- Provide comprehensive explanations with connections to broader concepts
- IMPORTANT: Each question MUST include a "sourceSegment" object with "startTime" and "endTime" in milliseconds from the transcript
- CRITICAL: Keep question text under 300 words, explanations under 200 words to ensure completion

OUTPUT FORMAT - CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON (absolutely NO markdown code fences like \`\`\`json or \`\`\`)
2. Do NOT wrap output in code blocks
3. Output must be COMPLETE - do NOT truncate or cut off mid-structure
4. Ensure ALL strings are properly closed with quotes
5. Ensure ALL objects are properly closed with braces
6. Escape newlines in string values as \\n (not actual newlines)
7. If you must use quotes inside strings, escape them as \\"
8. PRIORITIZE COMPLETION: If running low on output space, generate FEWER questions with COMPLETE structure rather than truncating
9. Keep questions and explanations concise but meaningful

JSON Structure:
{{
  "questions": [
    {{
      "question": "Your complex question here (max 300 words, avoid newlines, use \\\\n)",
      "type": "essay",
      "correctAnswer": "Key points for answer (concise, avoid newlines, use \\\\n)",
      "explanation": "Comprehensive explanation here (max 200 words, avoid newlines, use \\\\n)",
      "difficulty": "advanced",
      "sourceSegment": {{ "startTime": 0, "endTime": 1000 }},
      "points": 20,
      "tags": ["concept-name"]
    }}
  ],
  "title": "Quiz Title",
  "description": "Quiz Description",
  "estimatedDuration": 20,
  "topicsCovered": ["topic1", "topic2"]
}}

{format_instructions}

REMEMBER: Complete ALL questions in the JSON. Do not stop mid-generation. Output valid, complete JSON only.
`);

/**
 * Prompt for adaptive difficulty adjustment based on performance
 */
export const adaptiveDifficultyPrompt = PromptTemplate.fromTemplate(`
Based on the student's performance, recommend the next difficulty level for their quiz.

PERFORMANCE DATA:
- Current difficulty: {currentDifficulty}
- Score: {percentage}%
- Correct answers: {correctAnswers}/{totalQuestions}
- Average time per question: {avgTime} seconds

RULES:
- Score > 80% with fast completion (< 45s per question): Increase difficulty
- Score > 85% with moderate completion (45-90s): Increase difficulty
- Score 60-80%: Maintain current difficulty
- Score < 60%: Decrease difficulty
- Score < 50%: Definitely decrease difficulty

Respond with only: "beginner", "intermediate", or "advanced"
`);

/**
 * Prompt for generating personalized feedback
 */
export const quizFeedbackPrompt = PromptTemplate.fromTemplate(`
Generate personalized feedback for a student who just completed a quiz.

QUIZ PERFORMANCE:
- Score: {percentage}%
- Correct: {correctAnswers}/{totalQuestions}
- Time spent: {timeSpent} seconds
- Strong topics: {strongTopics}
- Weak topics: {weakTopics}

Provide:
1. Brief encouraging feedback (2-3 sentences)
2. Specific suggestions for improvement
3. Topics to review

Keep the tone supportive and constructive. Focus on growth mindset.
`);

/**
 * Default quiz generation prompt (uses adaptive selection)
 */
export const quizGenerationPrompt = PromptTemplate.fromTemplate(`
You are an expert educational content creator. Generate a quiz from the following transcript segment.

TRANSCRIPT:
{transcript}

DIFFICULTY LEVEL: {difficulty}

REQUIREMENTS:
- Generate {count} questions at {difficulty} level
- Include varied question types: MCQ, true/false, fill-in-blank, essay
- Each question should have clear correct answers
- Provide explanations for learning
- IMPORTANT: Each question MUST include a "sourceSegment" object with "startTime" and "endTime" in milliseconds
- Assign appropriate point values (10 points for simple, 20 for complex)

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences) with this structure:
{{
  "questions": [
    {{
      "question": "...",
      "type": "mcq|truefalse|fillin|essay",
      "options": ["..."],
      "correctAnswer": "...",
      "explanation": "...",
      "difficulty": "{difficulty}",
      "sourceSegment": {{ "startTime": 0, "endTime": 1000 }},
      "points": 10,
      "tags": ["..."]
    }}
  ]
}}

{format_instructions}

Create educational questions that promote active learning and retention.
`);
