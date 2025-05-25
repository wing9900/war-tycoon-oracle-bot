import { OpenAI } from 'openai';
import { Pinecone, type ScoredPineconeRecord } from '@pinecone-database/pinecone'; // Import ScoredPineconeRecord for match typing

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
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY }); // Removed '!' for safety, checks above should suffice

if (!PINECONE_INDEX_NAME) { // Additional runtime check for TypeScript's benefit
  throw new Error('CRITICAL: PINECONE_INDEX_NAME is effectively null or undefined after checks.');
}
const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);

// --- TypeScript Interfaces for Metadata ---
interface BaseMetadata {
  entity_type?: string;
  item_name?: string;
  info_type?: string;
  text_content_source?: string;
  [key: string]: any; 
}

interface AircraftGeneralInfoMetadata extends BaseMetadata {
  price?: number;
  currency?: string;
  unlock_method?: string;
  unlock_details?: string;
  armament_summary?: string[];
  utility?: string[];
  speed_min_display?: string;
  speed_max_display?: string;
  health_min_display?: string;
  health_max_display?: string;
}

// Define other specific metadata interfaces as you add more entity types...

// --- Helper function to format retrieved context ---
function formatRetrievedContext(matches: ScoredPineconeRecord<BaseMetadata>[]): string {
  if (!matches || matches.length === 0) {
    return "No relevant information was found in the knowledge base for this query.";
  }

  return matches.map((match, index) => {
    const metadata = match.metadata || {}; // Ensure metadata object exists
    const id = match.id || "N/A";
    const score = match.score !== undefined ? match.score.toFixed(4) : "N/A (Directly Fetched)"; // Adjust score display for fetched items
    const textSource = metadata.text_content_source || "No source text available for this chunk.";
    
    let details = `Item: ${metadata.item_name || "Unknown Item"}\nType: ${metadata.info_type || "General Information"}\n`;

    if (metadata.entity_type === 'aircraft') {
      if (metadata.info_type === 'general_info') {
        const acMeta = metadata as AircraftGeneralInfoMetadata;
        details += `Price: ${acMeta.currency || ''}${acMeta.price !== undefined ? acMeta.price : "N/A"}\n`;
        details += `Unlock: ${acMeta.unlock_method || "N/A"} (${acMeta.unlock_details || "N/A"})\n`;
        if (acMeta.armament_summary && acMeta.armament_summary.length > 0) {
          details += `Armaments: ${acMeta.armament_summary.join(', ')}\n`;
        }
        if (acMeta.utility && acMeta.utility.length > 0) {
          details += `Utilities: ${acMeta.utility.join(', ')}\n`;
        }
        details += `Display Speed: ${acMeta.speed_min_display || '[TBA]'} - ${acMeta.speed_max_display || '[TBA]'} MPH\n`;
        details += `Display Health: ${acMeta.health_min_display || '[TBA]'} - ${acMeta.health_max_display || '[TBA]'} HP\n`;
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
        details += `  Damage (Tier 2): ${metadata.display_fp_tier_2 || "[TBA]"} (Value: ${metadata.fp_t2_val ?? "[TBA]"})\n`;
        details += `  Damage (Tier 3): ${metadata.display_fp_tier_3 || "[TBA]"} (Value: ${metadata.fp_t3_val ?? "[TBA]"})\n`;
      } else if (metadata.info_type === 'armament_description') {
          details += `Described Weapon: ${metadata.weapon_name || "N/A"} (Count: ${metadata.count || "N/A"})\n`;
          if (metadata.characteristics && metadata.characteristics.length > 0) {
              details += `  Characteristics: ${metadata.characteristics.join(', ')}\n`;
          }
      } else if (metadata.info_type === 'history') {
          if (metadata.key_periods && metadata.key_periods.length > 0) {
              details += `Key Periods: ${metadata.key_periods.join(', ')}\n`;
          }
      } else if (metadata.info_type === 'overview_concise') {
          details += `Role: ${metadata.role || "N/A"}\n`;
          if (metadata.strengths && metadata.strengths.length > 0) details += `Strengths: ${metadata.strengths.join('; ')}\n`;
          if (metadata.weaknesses && metadata.weaknesses.length > 0) details += `Weaknesses: ${metadata.weaknesses.join('; ')}\n`;
      } else if (metadata.info_type === 'category_membership') {
          details += `Category: ${metadata.aircraft_category || "N/A"}\n`;
      }
    } 
    // Add 'else if (metadata.entity_type === 'tank') { ... }' blocks here for other entity types

    return `--- Context Chunk ${index + 1} (ID: ${id}, Score: ${score}) ---\n${details.trim()}\nFull Text Context:\n${textSource}\n---`;
  }).join('\n\n');
}


export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    console.log('Querying Pinecone with topK=3 for initial semantic matches...');
    const initialPineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 3, 
      includeMetadata: true,
    });
    console.log('Initial Pinecone query successful.');

    let finalMatches: ScoredPineconeRecord<BaseMetadata>[] = initialPineconeResponse.matches || [];
    let primaryItemName: string | undefined;

    if (finalMatches.length > 0 && finalMatches[0].metadata) {
      primaryItemName = finalMatches[0].metadata.item_name;
    } else {
      // Basic attempt to parse item name from question if no initial matches
      // This needs to be robust and list your known game items
      const knownItems = ["P-51 Mustang", "MiG-29 Fulcrum"]; // Expand this list
      for (const item of knownItems) {
        if (question.toLowerCase().includes(item.toLowerCase())) {
          primaryItemName = item;
          break;
        }
      }
    }
    
    if (primaryItemName) {
      const itemNameSnakeCase = primaryItemName.toLowerCase().replace(/ /g, '_').replace(/-/g, '_').replace(/\./g, '').replace(/\//g, '_');
      const overviewFullTextId = `${itemNameSnakeCase}_overview_full_text`;
      const isOverviewAlreadyFetched = finalMatches.some(match => match.id === overviewFullTextId);

      if (!isOverviewAlreadyFetched) {
        console.log(`Workspaceing overview_full_text for ${primaryItemName} (ID: ${overviewFullTextId})...`);
        try {
          const fetchResponse = await pineconeIndex.fetch([overviewFullTextId]);
          const overviewRecord = fetchResponse.records?.[overviewFullTextId]; // Use optional chaining
          if (overviewRecord) {
            // Construct a "match-like" object to add to finalMatches
            // The fetched record has id, metadata, and values. Score isn't applicable here.
            const fetchedMatch: ScoredPineconeRecord<BaseMetadata> = {
              id: overviewRecord.id,
              score: 1.0, // Assign a high score or indicate it was directly fetched
              metadata: overviewRecord.metadata as BaseMetadata || {},
              // values: overviewRecord.values // We don't need values for context string
            };
            finalMatches.unshift(fetchedMatch); // Prepend overview to prioritize it
            console.log(`Successfully fetched and added ${overviewFullTextId} to context.`);
          } else {
              console.log(`Could not fetch record for ${overviewFullTextId}`);
          }
        } catch (fetchError: any) {
          console.error(`Error fetching ${overviewFullTextId}:`, fetchError.message || fetchError);
        }
      } else {
          console.log(`Overview_full_text for ${primaryItemName} was already in initial semantic matches.`);
      }
    }

    // Remove duplicates by ID if any arose (e.g., if overview was fetched and also in initial query)
    const uniqueMatches = Array.from(new Map(finalMatches.map(match => [match.id, match])).values());

    const contexts = formatRetrievedContext(uniqueMatches);
    
    console.log('--- COMBINED CONTEXT FOR OPENAI (first 1500 chars) ---');
    console.log(contexts.length > 0 ? contexts.substring(0, 1500) + (contexts.length > 1500 ? '...' : '') : 'Context is empty.');
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');

    const system_prompt = `You are an expert assistant for the Roblox game War Tycoon. Your knowledge is based SOLELY on the "Context from Document(s)" provided below.
- Answer the user's "Question" using ONLY this context.
- Be sure to answer the question and include sufficient relevant information from the context. Make sure you provide sufficient details to ensure the user receives an informative, and well-rounded response that educates, enlightens, and satisfies them about their question without being too verbose or redundant. Quote or paraphrase other relevant parts of the context if helpful.
- If the user is seeking a general overview about an item: be sure to carefully assess the information available and provide all key details about the item to ensure the user receives a comprehensive understanding about it, without being excessive, redundant, or too verbose. Also be sure to include the price, stats, unlock method, and unlock details for the item if they are available in the context.
- If the context does not contain the answer, you MUST state that you don't have enough information about that specific question.
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
      max_tokens: 700, 
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
    console.error('Full error object:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: errorMessage, details: JSON.stringify(error, Object.getOwnPropertyNames(error)) });
  }
}