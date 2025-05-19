import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Read environment variables that are DEFINED in your Vercel settings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_FROM_ENV = process.env.PINECONE_INDEX; // Matches Vercel name PINECONE_INDEX
const PINECONE_ENVIRONMENT_FROM_ENV = process.env.PINECONE_ENVIRONMENT; // Matches Vercel name PINECONE_ENVIRONMENT

// --- START DIAGNOSTIC LOGGING (Useful for debugging) ---
console.log('--- PINEONE DIAGNOSTICS (Code expects PINECONE_INDEX & PINECONE_ENVIRONMENT) ---');
console.log('Value of process.env.OPENAI_API_KEY (is set):', !!OPENAI_API_KEY);
console.log('Value of process.env.PINECONE_API_KEY (is set):', !!PINECONE_API_KEY);
console.log('Value of process.env.PINECONE_INDEX:', PINECONE_INDEX_FROM_ENV);
console.log('Value of process.env.PINECONE_ENVIRONMENT:', PINECONE_ENVIRONMENT_FROM_ENV);
console.log('--- END PINEONE DIAGNOSTICS ---');

// --- VALIDATION CHECKS ---
if (!OPENAI_API_KEY) {
  console.error('CRITICAL ERROR: OPENAI_API_KEY is not set.');
  // Consider throwing an error to halt execution if critical env vars are missing
  // throw new Error('CRITICAL: OPENAI_API_KEY is not set.');
}
if (!PINECONE_API_KEY) {
  console.error('CRITICAL ERROR: PINECONE_API_KEY is not set.');
  // throw new Error('CRITICAL: PINECONE_API_KEY is not set.');
}
if (!PINECONE_INDEX_FROM_ENV) {
  console.error('CRITICAL ERROR: PINECONE_INDEX (read as PINECONE_INDEX_FROM_ENV) is not set.');
  // throw new Error('CRITICAL: PINECONE_INDEX (read as PINECONE_INDEX_FROM_ENV) is not set.');
}
if (!PINECONE_ENVIRONMENT_FROM_ENV) {
  console.error('CRITICAL ERROR: PINECONE_ENVIRONMENT (read as PINECONE_ENVIRONMENT_FROM_ENV) is not set.');
  // throw new Error('CRITICAL: PINECONE_ENVIRONMENT (read as PINECONE_ENVIRONMENT_FROM_ENV) is not set.');
}
// --- END CHECKS ---

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize Pinecone client
// Using the simplified constructor (only API key) which worked in the previous step
// (after you changed PINECONE_ENVIRONMENT value in Vercel to "aped-4627-b74a")
const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY!,
  // Ensure PINECONE_ENVIRONMENT_FROM_ENV is the correct specific environment for your index
  // (e.g., "aped-4627-b74a") in your Vercel settings.
  // If the Pinecone client v6 still gives argument errors with a valid serverless env string here,
  // then omitting it and relying on the API key (as done in the step that fixed the argument error)
  // is the way to go. The logs will tell us.
  environment: PINECONE_ENVIRONMENT_FROM_ENV!,
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
    // 1. Get embedding for the question
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: question,
    });
    const [{ embedding }] = embeddingResponse.data;

    // 2. Query Pinecone for relevant data
    console.log('Querying Pinecone with topK=5...');
    const pineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    });
    console.log('Pinecone query successful.');

    // Log the raw matches from Pinecone
    console.log('--- PINECONE MATCHES ---');
    if (pineconeResponse && pineconeResponse.matches && pineconeResponse.matches.length > 0) {
      pineconeResponse.matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`);
        console.log(`  ID: ${match.id}`);
        console.log(`  Score: ${match.score}`);
        console.log(`  Metadata:`, match.metadata); // This logs the whole metadata object
      });
    } else {
      console.log('No matches found in Pinecone for the query.');
    }
    console.log('--- END PINECONE MATCHES ---');

    // ***** THE CRITICAL CHANGE IS HERE *****
    const contexts = pineconeResponse.matches
      .map(match => match.metadata?.document) // Changed from match.metadata?.text
      .filter(Boolean)
      .join('\n---\n');

    // Log the combined context being sent to OpenAI
    console.log('--- COMBINED CONTEXT FOR OPENAI ---');
    // Log a snippet or the full context if it's not too long
    console.log(contexts.length > 0 ? contexts.substring(0, 1000) + (contexts.length > 1000 ? '...' : '') : 'Context is empty.');
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');

    if (contexts.length === 0 && pineconeResponse.matches && pineconeResponse.matches.length > 0) {
        console.warn("Contexts were retrieved from Pinecone, but resulted in an empty combined string. Check metadata field access and content.");
    } else if (contexts.length === 0) {
        console.warn("No context retrieved from Pinecone. OpenAI will respond without specific game context.");
    }

    // 3. Compose prompt for OpenAI
    const prompt = `
You are an expert on the Roblox game War Tycoon. Use the following context to answer the user's question as accurately as possible. If the context is empty or doesn't provide an answer, say you don't have specific information on that from the provided game data.

Context:
${contexts}

Question: ${question}
Answer:
    `;

    // 4. Get answer from OpenAI
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
    // Log specific Pinecone error messages which are often more informative
    if (error.name === 'PineconeNotFoundError' || error.name === 'PineconeArgumentError' || error.name === 'PineconeConnectionError') {
        console.error(`${error.name} details:`, error.message);
    }
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
}