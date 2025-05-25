import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Read environment variables that are DEFINED in your Vercel settings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX;

// --- START DIAGNOSTIC LOGGING ---
console.log('--- CHAT.TS ENV DIAGNOSTICS ---');
console.log('Value of process.env.OPENAI_API_KEY (is set):', !!OPENAI_API_KEY);
console.log('Value of process.env.PINECONE_API_KEY (is set):', !!PINECONE_API_KEY);
console.log('Value of process.env.PINECONE_INDEX:', PINECONE_INDEX_NAME);
console.log('--- END ENV DIAGNOSTICS ---');

// --- VALIDATION CHECKS ---
if (!OPENAI_API_KEY) {
  console.error('CRITICAL ERROR: OPENAI_API_KEY is not set in environment variables.');
  throw new Error('CRITICAL: OPENAI_API_KEY is not set.');
}
if (!PINECONE_API_KEY) {
  console.error('CRITICAL ERROR: PINECONE_API_KEY is not set in environment variables.');
  throw new Error('CRITICAL: PINECONE_API_KEY is not set.');
}
if (!PINECONE_INDEX_NAME) {
  console.error('CRITICAL ERROR: PINECONE_INDEX is not set in environment variables.');
  throw new Error('CRITICAL: PINECONE_INDEX is not set.');
}
// --- END CHECKS ---

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);

// --- TypeScript Interfaces for Metadata (Recommended for larger projects) ---
interface BaseMetadata {
  entity_type?: string;
  item_name?: string;
  info_type?: string;
  text_content_source?: string;
  // Add any other fields that are TRULY common to ALL metadata objects
  [key: string]: any; // Allow other dynamic properties
}

// Example specific metadata type (you would define more as needed)
interface AircraftGeneralInfoMetadata extends BaseMetadata {
  price?: number;
  currency?: string;
  unlock_method?: string;
  unlock_details?: string;
  armament_summary?: string[];
  utility?: string[];
  // ... other specific fields
}


// --- Helper function to format retrieved context ---
function formatRetrievedContext(matches: any[]): string {
  if (!matches || matches.length === 0) {
    return "No relevant information was found in the knowledge base for this query.";
  }

  return matches.map((match, index) => {
    const metadata = (match.metadata || {}) as BaseMetadata; // Ensure metadata exists, cast to base
    const id = match.id || "N/A";
    const score = match.score !== undefined ? match.score.toFixed(4) : "N/A";
    const textSource = metadata.text_content_source || "No source text available for this chunk.";
    
    let details = `Item: ${metadata.item_name || "Unknown Item"}\nType: ${metadata.info_type || "General Information"}\n`;

    // --- Conditional logic based on entity_type and info_type ---
    // This section needs to be expanded as you add more entity types and info types
    if (metadata.entity_type === 'aircraft') {
      if (metadata.info_type === 'general_info') {
        const acMeta = metadata as AircraftGeneralInfoMetadata; // Use specific interface if defined
        details += `Price: ${acMeta.currency || ''}${acMeta.price !== undefined ? acMeta.price : "N/A"}\n`;
        details += `Unlock: ${acMeta.unlock_method || "N/A"} (${acMeta.unlock_details || "N/A"})\n`;
        if (acMeta.armament_summary && acMeta.armament_summary.length > 0) {
          details += `Armaments: ${acMeta.armament_summary.join(', ')}\n`;
        }
        if (acMeta.utility && acMeta.utility.length > 0) {
          details += `Utilities: ${acMeta.utility.join(', ')}\n`;
        }
        details += `Speed: ${acMeta.speed_min_display || '[TBA]'} - ${acMeta.speed_max_display || '[TBA]'} MPH\n`;
        details += `Health: ${acMeta.health_min_display || '[TBA]'} - ${acMeta.health_max_display || '[TBA]'} HP\n`;
      } else if (metadata.info_type === 'stat_speed') {
        details += `Non-Upgraded Speed: ${metadata.display_speed_non_upgraded || "[TBA]"} MPH (Value: ${metadata.speed_nu_val ?? "[TBA]"})\n`;
        details += `Tier 1 Speed: ${metadata.display_speed_tier_1 || "[TBA]"} MPH (Value: ${metadata.speed_t1_val ?? "[TBA]"})\n`;
        details += `Tier 2 Speed: ${metadata.display_speed_tier_2 || "[TBA]"} MPH (Value: ${metadata.speed_t2_val ?? "[TBA]"})\n`;
        details += `Tier 3 Speed: ${metadata.display_speed_tier_3 || "[TBA]"} MPH (Value: ${metadata.speed_t3_val ?? "[TBA]"})\n`;
      } else if (metadata.info_type === 'stat_health') {
        details += `Non-Upgraded Health: ${metadata.display_health_non_upgraded || "[TBA]"} HP (Value: ${metadata.health_nu_val ?? "[TBA]"})\n`;
        details += `Tier 1 Health: ${metadata.display_health_tier_1 || "[TBA]"} HP (Value: ${metadata.health_t1_val ?? "[TBA]"})\n`;
        details += `Tier 2 Health: ${metadata.display_health_tier_2 || "[TBA]"} HP (Value: ${metadata.health_t2_val ?? "[TBA]"})\n`;
        details += `Tier 3 Health: ${metadata.display_health_tier_3 || "[TBA]"} HP (Value: ${metadata.health_t3_val ?? "[TBA]"})\n`;
      } else if (metadata.info_type === 'stat_firepower') {
        details += `Weapon Stats for: ${metadata.armament || "N/A"}\n`;
        details += `  Damage (Non-Upgraded): ${metadata.display_fp_non_upgraded || "[TBA]"} (Value: ${metadata.fp_nu_val ?? "[TBA]"})\n`;
        details += `  Damage (Tier 1): ${metadata.display_fp_tier_1 || "[TBA]"} (Value: ${metadata.fp_t1_val ?? "[TBA]"})\n`;
        // Add T2, T3 similarly
      } else if (metadata.info_type === 'armament_description') {
          details += `Described Weapon: ${metadata.weapon_name || "N/A"} (Count: ${metadata.count || "N/A"})\n`;
          if (metadata.characteristics && metadata.characteristics.length > 0) {
              details += `  Characteristics: ${metadata.characteristics.join(', ')}\n`;
          }
      } else if (metadata.info_type === 'history') {
          if (metadata.key_periods && metadata.key_periods.length > 0) {
              details += `Key Periods: ${metadata.key_periods.join(', ')}\n`;
          }
      }
      // Add more 'else if' blocks for other aircraft info_types (overview_concise, category_membership)
      // and for other entity_types as you add them.
    
    } else if (metadata.entity_type === 'tank') { // Example for future expansion
        details += `Tank Specific Detail: ${metadata.some_tank_field || "N/A"}\n`;
    } else if (metadata.entity_type === 'gun') { // Example for future expansion
        details += `Gun Specific Detail: ${metadata.some_gun_field || "N/A"}\n`;
    }
    // Add more top-level else if (metadata.entity_type === '...') blocks

    return `--- Context Chunk ${index + 1} (ID: ${id}, Score: ${score}) ---\n${details.trim()}\nFull Text Context:\n${textSource}\n---`;
  }).join('\n\n'); // Separate different chunks with a double newline for clarity
}


export default async function handler(req: any, res: any) {
  // CORS and Method Check
  res.setHeader('Access-Control-Allow-Origin', '*'); // More permissive for local dev, tighten for prod
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Add Authorization if you use it

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question } = req.body;
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question is required and must be a non-empty string.' });
  }

  console.log(`Received question: "${question}"`);

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
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
    // console.log('Raw Pinecone query response:', JSON.stringify(pineconeResponse, null, 2)); // For detailed debugging


    const contexts = formatRetrievedContext(pineconeResponse.matches || []); // Pass empty array if matches is undefined
    
    console.log('--- COMBINED CONTEXT FOR OPENAI (first 1500 chars) ---');
    console.log(contexts.length > 0 ? contexts.substring(0, 1500) + (contexts.length > 1500 ? '...' : '') : 'Context is empty.');
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');

    const system_prompt = `You are an expert assistant for the Roblox game War Tycoon. Your knowledge is based SOLELY on the "Context from Document(s)" provided below.
- Answer the user's "Question" using ONLY this context.
- Be concise and directly answer the question. Quote or paraphrase relevant parts of the context if helpful.
- If the context does not contain the answer, you MUST state that the information is not available in your current knowledge base for that specific question.
- Do NOT make up information, use external knowledge, or speculate beyond the provided context.
- If multiple documents are provided in the context, synthesize the information if they cover different aspects of the question.
- If the context seems irrelevant to the question, indicate that the provided information doesn't seem to answer the question.`;

    const user_prompt = `
Context from Document(s):
${contexts}

Question: ${question}

Answer:`;

    console.log("Sending prompt to OpenAI for completion...");
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', 
      messages: [
        { role: 'system', content: system_prompt },
        { role: 'user', content: user_prompt }
      ],
      max_tokens: 500, 
      temperature: 0.1, 
    });

    const answer = completion.choices[0]?.message?.content?.trim() || 'Sorry, I encountered an issue generating an answer.';
    console.log('OpenAI generated answer:', answer);

    res.status(200).json({ answer });

  } catch (error: any) {
    console.error('Error in /api/chat handler:', error);
    let errorMessage = 'An error occurred while processing your request.';
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = error.response.data.error.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    // Log more details for server-side debugging
    if (error.name && error.name.startsWith('Pinecone')) {
        console.error('Pinecone specific error:', error.message);
    }
    res.status(500).json({ error: errorMessage });
  }
}