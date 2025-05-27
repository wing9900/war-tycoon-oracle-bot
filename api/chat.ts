import { OpenAI } from 'openai';
import { Pinecone, type ScoredPineconeRecord } from '@pinecone-database/pinecone';

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

if (!PINECONE_INDEX_NAME) { 
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
  price?: number | string; 
  currency?: string | null;
  unlock_method?: string;
  unlock_details?: string;
  armament_summary?: string[];
  utility?: string[];
  speed_min_display?: string;
  speed_max_display?: string;
  health_min_display?: string;
  health_max_display?: string;
  hulls_component_count?: number;
  engines_component_count?: number;
  parts_cost_hulls?: number | string;
  parts_cost_weapon_systems?: number | string;
  parts_cost_engines?: number | string;
}

// --- Helper function to format retrieved context ---
function formatRetrievedContext(matches: ScoredPineconeRecord<BaseMetadata>[]): string {
  if (!matches || matches.length === 0) {
    return "No relevant information was found in the knowledge base for this query.";
  }

  return matches.map((match, index) => {
    const metadata = match.metadata || {}; 
    const id = match.id || "N/A";
    const score = match.score !== undefined ? match.score.toFixed(4) : "N/A (Directly Fetched)";
    const textSource = metadata.text_content_source || "No source text available for this chunk.";
    
    let details = `Item Name: ${metadata.item_name || "Unknown Item"}\nEntity Type: ${metadata.entity_type || "Unknown"}\nInfo Type: ${metadata.info_type || "General"}\n`;

    if (metadata.entity_type === 'aircraft') {
      const acMeta = metadata as any; 
      if (acMeta.info_type === 'general_info') {
        details += `Price/Unlock: ${acMeta.price !== undefined && acMeta.price !== "N/A" ? (acMeta.currency || '') + acMeta.price : acMeta.unlock_method || 'N/A'}\n`;
        details += `Unlock Details: ${acMeta.unlock_details || "N/A"}\n`;
        if (acMeta.armament_summary && acMeta.armament_summary.length > 0) {
          details += `Armaments Summary: ${acMeta.armament_summary.join(', ')}\n`;
        }
        if (acMeta.utility && acMeta.utility.length > 0) {
          details += `Utilities: ${acMeta.utility.join(', ')}\n`;
        }
        details += `Component Counts: Hulls: ${acMeta.hulls_component_count ?? 'N/A'}, Engines: ${acMeta.engines_component_count ?? 'N/A'}\n`;
        let spawnCosts = [];
        if (acMeta.parts_cost_hulls !== undefined) spawnCosts.push(`Hulls: ${acMeta.parts_cost_hulls}`);
        if (acMeta.parts_cost_weapon_systems !== undefined) spawnCosts.push(`Weapon Systems: ${acMeta.parts_cost_weapon_systems}`);
        if (acMeta.parts_cost_engines !== undefined) spawnCosts.push(`Engines: ${acMeta.parts_cost_engines}`);
        if (spawnCosts.length > 0) details += `Spawn Parts Cost: ${spawnCosts.join(', ')}\n`;
        details += `Display Speed Range: ${acMeta.speed_min_display || '[TBA]'} - ${acMeta.speed_max_display || '[TBA]'} MPH\n`;
        details += `Display Health Range: ${acMeta.health_min_display || '[TBA]'} - ${acMeta.health_max_display || '[TBA]'} HP\n`;
      } else if (acMeta.info_type === 'stat_speed') {
        details += `Unit: ${acMeta.unit || "N/A"}\n`;
        details += `  Non-Upgraded Speed: ${acMeta.display_speed_non_upgraded || "[TBA]"} (Value: ${acMeta.speed_nu_val ?? "[TBA]"})\n`;
        details += `  Tier 1 Speed: ${acMeta.display_speed_tier_1 || "[TBA]"} (Value: ${acMeta.speed_t1_val ?? "[TBA]"})\n`;
        details += `  Tier 2 Speed: ${acMeta.display_speed_tier_2 || "[TBA]"} (Value: ${acMeta.speed_t2_val ?? "[TBA]"})\n`;
        details += `  Tier 3 Speed: ${acMeta.display_speed_tier_3 || "[TBA]"} (Value: ${acMeta.speed_t3_val ?? "[TBA]"})\n`;
      } else if (acMeta.info_type === 'stat_health') {
        details += `Unit: ${acMeta.unit || "N/A"}\n`;
        details += `  Non-Upgraded Health: ${acMeta.display_health_non_upgraded || "[TBA]"} (Value: ${acMeta.health_nu_val ?? "[TBA]"})\n`;
        details += `  Tier 1 Health: ${acMeta.display_health_tier_1 || "[TBA]"} (Value: ${acMeta.health_t1_val ?? "[TBA]"})\n`;
        details += `  Tier 2 Health: ${acMeta.display_health_tier_2 || "[TBA]"} (Value: ${acMeta.health_t2_val ?? "[TBA]"})\n`;
        details += `  Tier 3 Health: ${acMeta.display_health_tier_3 || "[TBA]"} (Value: ${acMeta.health_t3_val ?? "[TBA]"})\n`;
      } else if (acMeta.info_type === 'stat_firepower') {
        details += `Weapon Stats for: ${acMeta.armament || "N/A"}\nUnit: ${acMeta.unit || "N/A"}\n`;
        details += `  Damage (Non-Upgraded): ${acMeta.display_fp_non_upgraded || "[TBA]"} (Value: ${acMeta.fp_nu_val ?? "[TBA]"})\n`;
        details += `  Damage (Tier 1): ${acMeta.display_fp_tier_1 || "[TBA]"} (Value: ${acMeta.fp_t1_val ?? "[TBA]"})\n`;
        details += `  Damage (Tier 2): ${acMeta.display_fp_tier_2 || "[TBA]"} (Value: ${acMeta.fp_t2_val ?? "[TBA]"})\n`;
        details += `  Damage (Tier 3): ${acMeta.display_fp_tier_3 || "[TBA]"} (Value: ${acMeta.fp_t3_val ?? "[TBA]"})\n`;
      } else if (acMeta.info_type === 'armament_description') {
          details += `Described Weapon: ${acMeta.weapon_name || "N/A"} (Count: ${acMeta.count ?? "N/A"}, Type: ${acMeta.weapon_type_general || "N/A"})\n`;
          if (acMeta.characteristics && acMeta.characteristics.length > 0) {
              details += `  Characteristics: ${acMeta.characteristics.join(', ')}\n`;
          }
          details += `  Notes: ${acMeta.notes || "N/A"}\n`;
      } else if (acMeta.info_type === 'history') {
          details += `Section: ${acMeta.section_title || "History"}\n`;
          if (acMeta.key_periods && acMeta.key_periods.length > 0) {
              details += `  Key Periods: ${acMeta.key_periods.join(', ')}\n`;
          }
      } else if (acMeta.info_type === 'overview_concise') {
          details += `Role: ${acMeta.role || "N/A"}\n`;
          if (acMeta.strengths && acMeta.strengths.length > 0) details += `  Strengths: ${acMeta.strengths.join('; ')}\n`;
          if (acMeta.weaknesses && acMeta.weaknesses.length > 0) details += `  Weaknesses: ${acMeta.weaknesses.join('; ')}\n`;
          if (acMeta.utility_summary_for_concise && acMeta.utility_summary_for_concise.length > 0) details += `  Utilities: ${acMeta.utility_summary_for_concise.join(', ')}\n`;
      } else if (acMeta.info_type === 'category_membership') {
          details += `Category: ${acMeta.aircraft_category || "N/A"}\n`;
      }
    } 
    // --- EXPAND HERE: Add 'else if (metadata.entity_type === 'tank') { ... }' etc. ---

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
    }
    if (!primaryItemName && question) { 
      // <<< EXPAND THIS LIST WITH ALL YOUR GAME ITEM NAMES for better primary item detection >>>
      const knownItems = ["P-51 Mustang", "MiG-29 Fulcrum", "Spitfire"]; 
      for (const item of knownItems) {
        if (question.toLowerCase().includes(item.toLowerCase())) {
          primaryItemName = item;
          console.log(`Primary item identified from question: ${primaryItemName}`);
          break;
        }
      }
    }
    
    if (primaryItemName) {
      const itemNameSnakeCase = primaryItemName.toLowerCase().replace(/ /g, '_').replace(/-/g, '_').replace(/\./g, '').replace(/\//g, '_');
      const overviewFullTextId = `${itemNameSnakeCase}_overview_full_text`;
      const generalInfoId = `${itemNameSnakeCase}_general_info`; // Also fetch general_info

      const idsToFetchIfNeeded: string[] = [];
      if (!finalMatches.some(match => match.id === overviewFullTextId)) {
        idsToFetchIfNeeded.push(overviewFullTextId);
      }
      if (!finalMatches.some(match => match.id === generalInfoId)) {
        idsToFetchIfNeeded.push(generalInfoId);
      }
      
      if (idsToFetchIfNeeded.length > 0) {
        console.log(`Attempting to fetch essential chunks for ${primaryItemName}: ${idsToFetchIfNeeded.join(', ')}...`);
        try {
          const fetchResponse = await pineconeIndex.fetch(idsToFetchIfNeeded);
          if (fetchResponse.records) {
            for (const idToFetch of idsToFetchIfNeeded) {
              const record = fetchResponse.records[idToFetch];
              if (record && record.metadata) {
                const fetchedMatch: ScoredPineconeRecord<BaseMetadata> = {
                  id: record.id, 
                  score: 0.98, // Assign a high score to indicate importance / direct fetch
                  metadata: (record.metadata as BaseMetadata),
                };
                finalMatches.push(fetchedMatch); // Add to the list
                console.log(`Successfully fetched and added ${idToFetch} to context.`);
              } else {
                console.log(`Could not fetch or find metadata for record ${idToFetch}.`);
              }
            }
          }
        } catch (fetchError: any) {
          console.error(`Error fetching essential chunks for ${primaryItemName}:`, fetchError.message || fetchError);
        }
      } else {
          console.log(`Essential chunks for ${primaryItemName} were likely already in initial semantic matches.`);
      }
    }

    // Sort by score (descending) and then remove duplicates by ID, keeping the one with higher score or first encountered
    finalMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
    const uniqueMatches = Array.from(new Map(finalMatches.map(match => [match.id, match])).values());
    const limitedMatches = uniqueMatches.slice(0, 7); // Limit total context chunks, adjust as needed

    const contexts = formatRetrievedContext(limitedMatches);
    
    console.log('--- COMBINED CONTEXT FOR OPENAI (first 2000 chars) ---');
    console.log(contexts.length > 0 ? contexts.substring(0, 2000) + (contexts.length > 2000 ? '...' : '') : 'Context is empty.');
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');

    const system_prompt = `You are an expert assistant for the Roblox game War Tycoon. Your knowledge is based SOLELY on the "Context from Document(s)" provided below.
- Answer the user's "Question" using ONLY this context.
- If the user is seeking an overview about an item (for example, if the user says "tell me about the p-51 plane"), utilize the information in the 'Full Text Context' of the 'overview_full_text' chunk primarily, and supplement with key details from 'general_info' and other relevant chunks. Be sure to include important information like price/unlock conditions, key stats (speed, health), primary armaments, utilities, seating capacity, component counts, spawn parts costs, and a summary of strengths and weaknesses if available in the context. Aim for a comprehensive yet balanced answer.
- For "general_info" chunks, "parts_cost_hulls", "parts_cost_weapon_systems", and "parts_cost_engines" refer to the number of specific parts required to spawn or respawn the item. This is different from 'hulls_component_count', 'engines_component_count' (which are actual components of the vehicle) or 'armament_summary' (which lists the equipped weapons).
- If you are asked for the stats of an item,make sure you provide all of the stats that they want!
- If you are asked to compare items in the game, be sure to include all the important information, including: the price, stats, armament(s), utility information, seating capacity, strengths, weaknesses, unlock method, and unlock details FOR EACH OF THE ITEMS if context is provided for them.
- If the context does not contain the answer, you MUST state that the information is not available in your current knowledge base for that specific question.
- If the user's input is not rational, kindly ask them to clarify their question.
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
      max_tokens: 1024, // Increased for potentially more detailed answers
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