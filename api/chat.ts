import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME; // NEW: e.g., "war-tycoon-wiki-index"
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT; // NEW: e.g., "aped-4627-b74a" or the full "aws-us-east-1" style if that's what your Pinecone env is

// --- START DIAGNOSTIC LOGGING ---
console.log('--- PINEONE DIAGNOSTICS ---');
console.log('Value of process.env.OPENAI_API_KEY (is set):', !!OPENAI_API_KEY);
console.log('Value of process.env.PINECONE_API_KEY (is set):', !!PINECONE_API_KEY);
console.log('Value of process.env.PINECONE_INDEX_NAME:', PINECONE_INDEX_NAME);
console.log('Value of process.env.PINECONE_ENVIRONMENT:', PINECONE_ENVIRONMENT);
console.log('--- END PINEONE DIAGNOSTICS ---');

if (!OPENAI_API_KEY) console.error('CRITICAL ERROR: OPENAI_API_KEY is not set.');
if (!PINECONE_API_KEY) console.error('CRITICAL ERROR: PINECONE_API_KEY is not set.');
if (!PINECONE_INDEX_NAME) console.error('CRITICAL ERROR: PINECONE_INDEX_NAME is not set.');
if (!PINECONE_ENVIRONMENT) console.error('CRITICAL ERROR: PINECONE_ENVIRONMENT is not set.');
// --- END CHECKS ---

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize Pinecone with the environment if your API key spans multiple,
// or if the client requires it to correctly route control plane calls.
// The 'environment' here is the Pinecone environment like 'us-east-1-aws', 'gcp-starter', etc.
// Your host "aped-4627-b74a" looks like part of a newer Pinecone environment string, often related to GCP or specific AWS regions.
// You need to find the *full Pinecone environment string* from your Pinecone console for your index.
const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY!,
  environment: PINECONE_ENVIRONMENT!, // This needs to be the correct Pinecone environment string
});

const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME!);

export default async function handler(req: any, res: any) {
  // ... (CORS headers and method checks) ...
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
  // ...

  try {
    // ... (your existing try block for embeddings, query, OpenAI completion)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: question,
    });
    const [{ embedding }] = embeddingResponse.data;

    // Query Pinecone
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
    if (error.name === 'PineconeNotFoundError') {
        console.error('PineconeNotFoundError details:', error.message);
    }
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
}