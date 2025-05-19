import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Read environment variables that are DEFINED in your Vercel settings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_FROM_ENV = process.env.PINECONE_INDEX; // Matches Vercel name
const PINECONE_ENVIRONMENT_FROM_ENV = process.env.PINECONE_ENVIRONMENT; // Matches Vercel name

// --- START DIAGNOSTIC LOGGING ---
console.log('--- PINEONE DIAGNOSTICS (Code expects PINECONE_INDEX & PINECONE_ENVIRONMENT) ---');
console.log('Value of process.env.OPENAI_API_KEY (is set):', !!OPENAI_API_KEY);
console.log('Value of process.env.PINECONE_API_KEY (is set):', !!PINECONE_API_KEY);
console.log('Value of process.env.PINECONE_INDEX:', PINECONE_INDEX_FROM_ENV);
console.log('Value of process.env.PINECONE_ENVIRONMENT:', PINECONE_ENVIRONMENT_FROM_ENV);
console.log('--- END PINEONE DIAGNOSTICS ---');

// --- VALIDATION CHECKS ---
if (!OPENAI_API_KEY) {
  console.error('CRITICAL ERROR: OPENAI_API_KEY is not set.');
  throw new Error('CRITICAL: OPENAI_API_KEY is not set.');
}
if (!PINECONE_API_KEY) {
  console.error('CRITICAL ERROR: PINECONE_API_KEY is not set.');
  throw new Error('CRITICAL: PINECONE_API_KEY is not set.');
}
if (!PINECONE_INDEX_FROM_ENV) {
  console.error('CRITICAL ERROR: PINECONE_INDEX (read as PINECONE_INDEX_FROM_ENV) is not set.');
  throw new Error('CRITICAL: PINECONE_INDEX (read as PINECONE_INDEX_FROM_ENV) is not set.');
}
if (!PINECONE_ENVIRONMENT_FROM_ENV) {
  console.error('CRITICAL ERROR: PINECONE_ENVIRONMENT (read as PINECONE_ENVIRONMENT_FROM_ENV) is not set.');
  throw new Error('CRITICAL: PINECONE_ENVIRONMENT (read as PINECONE_ENVIRONMENT_FROM_ENV) is not set.');
}
// --- END CHECKS ---

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize Pinecone client
// CRITICAL: The value of PINECONE_ENVIRONMENT_FROM_ENV needs to be corrected in Vercel
// from "us-east-1" to your actual Pinecone index environment (e.g., "aped-4627-b74a")
const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY!,
  environment: PINECONE_ENVIRONMENT_FROM_ENV!, // This will use the value "us-east-1" initially
});

const pineconeIndex = pinecone.index(PINECONE_INDEX_FROM_ENV!);

export default async function handler(req: any, res: any) {

  res.setHeader('Access-Control-Allow-Origin', 'https://wartycoonai.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required.' });
  }

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: question,
    });
    const [{ embedding }] = embeddingResponse.data;

    const pineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    });

    const contexts = pineconeResponse.matches
      .map(match => match.metadata?.text)
      .filter(Boolean)
      .join('\n---\n');

    const prompt = `
You are an expert on the Roblox game War Tycoon. Use the following context to answer the user's question as accurately as possible.

Context:
${contexts}

Question: ${question}
Answer:
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      temperature: 0.2,
    });

    const answer = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not generate an answer.';
    res.status(200).json({ answer });

  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    if (error.cause) {
      console.error('Caused by:', error.cause);
      if (error.cause.hostname) {
        console.error('Error details - hostname attempted:', error.cause.hostname);
      }
    }
    if (error.name === 'PineconeNotFoundError' || error.name === 'PineconeArgumentError') {
        console.error(`${error.name} details:`, error.message);
    }
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
}