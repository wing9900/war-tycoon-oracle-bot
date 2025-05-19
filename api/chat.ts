import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Read environment variables that are DEFINED in your Vercel settings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_FROM_ENV = process.env.PINECONE_INDEX; // Matches Vercel name PINECONE_INDEX
const PINECONE_ENVIRONMENT_FROM_ENV = process.env.PINECONE_ENVIRONMENT; // Matches Vercel name PINECONE_ENVIRONMENT

// --- START DIAGNOSTIC LOGGING ---
console.log('--- PINEONE DIAGNOSTICS (Code expects PINECONE_INDEX & PINECONE_ENVIRONMENT) ---');
console.log('Value of process.env.OPENAI_API_KEY (is set):', !!OPENAI_API_KEY);
console.log('Value of process.env.PINECONE_API_KEY (is set):', !!PINECONE_API_KEY);
console.log('Value of process.env.PINECONE_INDEX:', PINECONE_INDEX_FROM_ENV);
console.log('Value of process.env.PINECONE_ENVIRONMENT (logged but not used in Pinecone constructor):', PINECONE_ENVIRONMENT_FROM_ENV);
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
  // This is okay now since we are not using it in the constructor
  console.warn('WARNING: PINECONE_ENVIRONMENT is set but not directly used in Pinecone() constructor in this version of the code.');
}
// --- END CHECKS ---

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ***** THE CRITICAL CHANGE IS HERE *****
// Initialize Pinecone client with ONLY the API key for serverless index lookup by name
const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY!,
  // environment: PINECONE_ENVIRONMENT_FROM_ENV!, // REMOVED THIS LINE
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

    console.log('Querying Pinecone with topK=5...');
    const pineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    });
    console.log('Pinecone query successful.');

    console.log('--- PINECONE MATCHES ---');
    if (pineconeResponse && pineconeResponse.matches && pineconeResponse.matches.length > 0) {
      pineconeResponse.matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`);
        console.log(`  ID: ${match.id}`);
        console.log(`  Score: ${match.score}`);
        console.log(`  Metadata:`, match.metadata);
      });
    } else {
      console.log('No matches found in Pinecone for the query.');
    }
    console.log('--- END PINECONE MATCHES ---');

    const contexts = pineconeResponse.matches
      .map(match => match.metadata?.document)
      .filter(Boolean)
      .join('\n---\n');

    console.log('--- COMBINED CONTEXT FOR OPENAI ---');
    console.log(contexts.length > 0 ? contexts.substring(0, 1000) + (contexts.length > 1000 ? '...' : '') : 'Context is empty.');
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');

    if (contexts.length === 0 && pineconeResponse.matches && pineconeResponse.matches.length > 0) {
        console.warn("Contexts were retrieved from Pinecone, but resulted in an empty combined string. Check metadata field access and content.");
    } else if (contexts.length === 0) {
        console.warn("No context retrieved from Pinecone. OpenAI will respond without specific game context.");
    }

    const prompt = `
You are an expert on the Roblox game War Tycoon. Use the following context to answer the user's question.
If the context provides relevant information, use it to answer as accurately as possible.
If the context is empty or does not directly answer the question, state that you can't fully answer the question currently.

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
    console.log('OpenAI generated answer:', answer);

    res.status(200).json({ answer });

  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    if (error.cause) {
      console.error('Caused by:', error.cause);
      if (error.cause.hostname) {
        console.error('Error details - hostname attempted:', error.cause.hostname);
      }
    }
    if (error.name === 'PineconeNotFoundError' || error.name === 'PineconeArgumentError' || error.name === 'PineconeConnectionError') {
        console.error(`${error.name} details:`, error.message);
    }
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
}