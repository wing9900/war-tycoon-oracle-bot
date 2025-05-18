import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// MODIFIED LINE: Ensure PINECONE_INDEX_HOST is set in your Vercel environment
// to the full host URL of your Pinecone index.
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_HOST!);

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
    const pineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    });

    const contexts = pineconeResponse.matches
      .map(match => match.metadata?.text)
      .filter(Boolean)
      .join('\n---\n');

    // 3. Compose prompt for OpenAI
    const prompt = `
You are an expert on the Roblox game War Tycoon. Use the following context to answer the user's question as accurately as possible.

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

    res.status(200).json({ answer });
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    // ADDED: More detailed logging for the cause of the error if it exists
    if (error.cause) {
      console.error('Caused by:', error.cause);
    }
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
}