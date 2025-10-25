import { PromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';

// Summary generation prompts
export const quickSummaryPrompt = new PromptTemplate({
  template: `You are an expert at creating concise summaries. Generate a quick summary (1-2 sentences) of the following content.

Content: {content}

Quick Summary:`,
  inputVariables: ['content'],
});

export const briefSummaryPrompt = new PromptTemplate({
  template: `You are an expert at creating educational summaries. Generate a brief summary (200-300 words) of the following content. Include the main concepts and key takeaways.

Content: {content}

Brief Summary:`,
  inputVariables: ['content'],
});

export const detailedSummaryPrompt = new PromptTemplate({
  template: `You are an expert at creating comprehensive educational summaries. Generate a detailed summary (800-1200 words) of the following content. 

Include:
- Main concepts and themes
- Key points with explanations
- Important examples or case studies
- Connections between ideas
- Learning objectives

Content: {content}

Detailed Summary:`,
  inputVariables: ['content'],
});

// Flashcard generation prompt
export const flashcardGenerationPrompt = ChatPromptTemplate.fromTemplate(
  `You are an expert at creating educational flashcards. Generate {count} high-quality flashcards from the following transcript segment.

Transcript: {transcript}

Requirements:
- Create diverse types: multiple choice, true/false, fill-in-blank, and essay questions
- Vary difficulty levels: easy, medium, and hard
- Focus on key concepts, not trivial details
- Include clear, concise questions and comprehensive answers
- Link each flashcard to the source timestamp

{format_instructions}

CRITICAL JSON FORMATTING RULES:
- Output MUST be complete valid JSON array
- Do NOT truncate or cut off JSON output mid-structure
- Ensure all strings are properly closed with quotes
- Ensure all objects are properly closed with braces
- Avoid newlines inside string values (use \\n for line breaks within strings)
- Complete ALL flashcards before ending the response

Generate the flashcards now:`
);

// Quiz generation prompt
export const quizGenerationPrompt = ChatPromptTemplate.fromTemplate(
  `You are an expert at creating educational assessments. Generate {count} quiz questions from the following content at {difficulty} difficulty level.

Content: {content}

Requirements:
- Mix question types: multiple choice, true/false, short answer
- Difficulty level: {difficulty}
- Test understanding, not just memorization
- Provide correct answers and explanations
- Link questions to source timestamps when available

{format_instructions}

Generate the quiz questions now:`
);

// Q&A system prompt
export const qaSystemPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an AI tutor helping students understand educational content. Your role is to:
- Provide clear, accurate answers based on the provided context
- Cite specific timestamps from the video/document when relevant
- Explain concepts in simple terms
- Encourage deeper thinking with follow-up questions
- Admit when you don't know something rather than guessing

Always base your answers on the provided context. If the context doesn't contain enough information, say so.`,
  ],
  ['human', 'Context: {context}'],
  ['human', 'Question: {question}'],
]);

// Concept extraction prompt
export const conceptExtractionPrompt = new PromptTemplate({
  template: `Analyze the following content and extract the main concepts, topics, and key terms.

Content: {content}

Provide:
1. Main topics (3-5)
2. Key concepts (5-10)
3. Important terms and definitions

Format as JSON:
{{
  "topics": ["topic1", "topic2", ...],
  "concepts": ["concept1", "concept2", ...],
  "terms": [
    {{"term": "term1", "definition": "definition1"}},
    ...
  ]
}}`,
  inputVariables: ['content'],
});
