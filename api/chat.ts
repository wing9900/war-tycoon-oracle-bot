import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Read environment variables that are DEFINED in your Vercel settings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_FROM_ENV = process.env.PINECONE_INDEX; // Matches Vercel name
const PINECONE_ENVIRONMENT_FROM_ENV = process.env.PINECONE_ENVIRONMENT; // Matches Vercel name

// --- START DIAGNOSTIC LOGGING (Keep this for now or remove if confident) ---
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
  // If you've confirmed removing 'environment' from Pinecone constructor works,
  // you might not need to error out here, but logging it is still useful.
  console.warn('WARNING: PINECONE_ENVIRONMENT is set but not used in Pinecone() constructor in this version of the code.');
}
// --- END CHECKS ---

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize Pinecone client
// Using the simplified constructor (only API key) which worked
const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY!,
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

    // 2. Query Pinecone for relevant data
    console.log('Querying Pinecone with topK=5...'); // Log before query
    const pineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 5, // You're asking for 5 chunks
      includeMetadata: true, // Essential to get the 'text'
      // includeValues: false, // Optional: set to true if you want to see the vectors themselves
    });
    console.log('Pinecone query successful.');

    // ADDED: Log the raw matches from Pinecone
    console.log('--- PINECONE MATCHES ---');
    if (pineconeResponse && pineconeResponse.matches && pineconeResponse.matches.length > 0) {
      pineconeResponse.matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`);
        console.log(`  ID: ${match.id}`);
        console.log(`  Score: ${match.score}`);
        console.log(`  Metadata:`, match.metadata); // This will log the whole metadata object
        // If your text is directly in metadata.text:
        // console.log(`  Text Chunk: ${match.metadata?.text ? match.metadata.text.substring(0, 100) + '...' : 'No text in metadata'}`);
      });
    } else {
      console.log('No matches found in Pinecone for the query.');
    }
    console.log('--- END PINECONE MATCHES ---');

    const contexts = pineconeResponse.matches
      .map(match => match.metadata?.text) // Assuming your text is in 'metadata.text'
      .filter(Boolean)
      .join('\n---\n');

    // ADDED: Log the combined context being sent to OpenAI
    console.log('--- COMBINED CONTEXT FOR OPENAI ---');
    console.log(contexts.substring(0, 500) + (contexts.length > 500 ? '...' : '')); // Log a snippet
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');


    if (contexts.length === 0) {
        console.warn("No context retrieved from Pinecone. OpenAI will respond without specific game context.");
        // Optionally, you could modify the prompt or send a specific message back to the user
    }

    const prompt = `
You are an expert on the Roblox game War Tycoon. Use the following context to answer the user's question as accurately as possible. If the context is empty or doesn't provide an answer, say you don't have specific information on that from the provided game data.

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
    console.log('OpenAI generated answer:', answer); // Log the final answer

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