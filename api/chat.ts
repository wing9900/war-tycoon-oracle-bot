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

// --- Keywords for "all planes" queries and assumed document ID ---
const ALL_PLANES_KEYWORDS = ["all planes", "all aircraft", "every plane", "list of planes", "list all planes", "show all planes"];
const ALL_PLANES_SUMMARY_DOC_ID = "all_aircraft_summary_info";

// --- Keywords for specific stat requests ---
const SPEED_STAT_KEYWORDS = ['speed', 'fast', 'mph', 'kph', 'velocity'];
const HEALTH_STAT_KEYWORDS = ['health', 'hp', 'survivability', 'durability', 'hitpoints', 'hit points', 'armor'];


// --- TypeScript Interfaces for Metadata ---
interface BaseMetadata {
  entity_type?: string;
  item_name?: string;
  info_type?: string;
  text_content_source?: string;
  planes_summary?: Array<{
    name: string;
    price?: number | string;
    unlock_method?: string;
    seating_capacity?: number;
    armament_summary?: string[] | string;
    speed_range?: string;
    health_range?: string;
  }>;
  // Fields for stat_speed, stat_health etc. (can be caught by [key: string]: any)
  unit?: string;
  display_speed_non_upgraded?: string; speed_nu_val?: number | string;
  display_speed_tier_1?: string; speed_t1_val?: number | string;
  display_speed_tier_2?: string; speed_t2_val?: number | string;
  display_speed_tier_3?: string; speed_t3_val?: number | string;
  display_health_non_upgraded?: string; health_nu_val?: number | string;
  display_health_tier_1?: string; health_t1_val?: number | string;
  display_health_tier_2?: string; health_t2_val?: number | string;
  display_health_tier_3?: string; health_t3_val?: number | string;
  [key: string]: any;
}

interface AircraftGeneralInfoMetadata extends BaseMetadata {
  price?: number | string;
  currency?: string | null;
  unlock_method?: string;
  unlock_details?: string;
  seating_capacity?: number;
  armament_summary?: string[] | string;
  utility?: string[] | string;
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
    const acMeta = metadata as any; // Using 'any' for flexibility, maps to relevant metadata fields

    if (id === ALL_PLANES_SUMMARY_DOC_ID && acMeta.planes_summary && Array.isArray(acMeta.planes_summary)) {
      details += "Summary of All Aircraft:\n";
      acMeta.planes_summary.forEach((plane: any) => { // Explicitly type plane as any or a defined interface
        details += `  - Name: ${plane.name || 'N/A'}\n`;
        if (plane.price) details += `    Price/Unlock: ${plane.price}${plane.unlock_method ? ` (${plane.unlock_method})` : ''}\n`;
        if (plane.seating_capacity) details += `    Seating: ${plane.seating_capacity}\n`;
        if (plane.armament_summary) {
          if (Array.isArray(plane.armament_summary)) details += `    Armaments: ${plane.armament_summary.join(', ')}\n`;
          else details += `    Armaments: ${plane.armament_summary}\n`;
        }
        if (plane.speed_range) details += `    Speed: ${plane.speed_range}\n`;
        if (plane.health_range) details += `    Health: ${plane.health_range}\n`;
      });
       details += "\n";
    } else if (acMeta.entity_type === 'aircraft') {
      if (acMeta.info_type === 'general_info') {
        details += `Price/Unlock: ${acMeta.price !== undefined && acMeta.price !== "N/A" ? (acMeta.currency || '') + acMeta.price : acMeta.unlock_method || 'N/A'}\n`;
        details += `Unlock Details: ${acMeta.unlock_details || "N/A"}\n`;
        details += `Seating Capacity: ${acMeta.seating_capacity ?? 'N/A'}\n`;

        if (acMeta.armament_summary) {
          if (Array.isArray(acMeta.armament_summary) && acMeta.armament_summary.length > 0) {
            details += `Armaments Summary: ${acMeta.armament_summary.join(', ')}\n`;
          } else if (typeof acMeta.armament_summary === 'string' && acMeta.armament_summary.trim().length > 0) {
            details += `Armaments Summary: ${acMeta.armament_summary}\n`;
          }
        }

        if (acMeta.utility) {
          if (Array.isArray(acMeta.utility) && acMeta.utility.length > 0) {
            details += `Utilities: ${acMeta.utility.join(', ')}\n`;
          } else if (typeof acMeta.utility === 'string' && acMeta.utility.trim().length > 0) {
            details += `Utilities: ${acMeta.utility}\n`;
          }
        }

        details += `Component Counts: Hulls: ${acMeta.hulls_component_count ?? 'N/A'}, Engines: ${acMeta.engines_component_count ?? 'N/A'}\n`;
        let spawnCosts = [];
        if (acMeta.parts_cost_hulls !== undefined) spawnCosts.push(`Hulls: ${acMeta.parts_cost_hulls}`);
        if (acMeta.parts_cost_weapon_systems !== undefined) spawnCosts.push(`Weapon Systems: ${acMeta.parts_cost_weapon_systems}`);
        if (acMeta.parts_cost_engines !== undefined) spawnCosts.push(`Engines: ${acMeta.parts_cost_engines}`);
        if (spawnCosts.length > 0) details += `Spawn Parts Cost: ${spawnCosts.join(', ')}\n`;
        // Display overall range if min/max are present, avoid redundancy if detailed stats are also shown by LLM
        if (acMeta.speed_min_display || acMeta.speed_max_display) {
             details += `Display Speed Range: ${acMeta.speed_min_display || '[TBA]'} - ${acMeta.speed_max_display || '[TBA]'} MPH\n`;
        }
        if (acMeta.health_min_display || acMeta.health_max_display) {
            details += `Display Health Range: ${acMeta.health_min_display || '[TBA]'} - ${acMeta.health_max_display || '[TBA]'} HP\n`;
        }
      } else if (acMeta.info_type === 'stat_speed') {
        details += `Detailed Speed Stats (Unit: ${acMeta.unit || "N/A"}):\n`;
        details += `  Non-Upgraded: ${acMeta.display_speed_non_upgraded || "[TBA]"} (Value: ${acMeta.speed_nu_val ?? "[TBA]"})\n`;
        details += `  Tier 1: ${acMeta.display_speed_tier_1 || "[TBA]"} (Value: ${acMeta.speed_t1_val ?? "[TBA]"})\n`;
        details += `  Tier 2: ${acMeta.display_speed_tier_2 || "[TBA]"} (Value: ${acMeta.speed_t2_val ?? "[TBA]"})\n`;
        details += `  Tier 3: ${acMeta.display_speed_tier_3 || "[TBA]"} (Value: ${acMeta.speed_t3_val ?? "[TBA]"})\n`;
      } else if (acMeta.info_type === 'stat_health') {
        details += `Detailed Health Stats (Unit: ${acMeta.unit || "N/A"}):\n`;
        details += `  Non-Upgraded: ${acMeta.display_health_non_upgraded || "[TBA]"} (Value: ${acMeta.health_nu_val ?? "[TBA]"})\n`;
        details += `  Tier 1: ${acMeta.display_health_tier_1 || "[TBA]"} (Value: ${acMeta.health_t1_val ?? "[TBA]"})\n`;
        details += `  Tier 2: ${acMeta.display_health_tier_2 || "[TBA]"} (Value: ${acMeta.health_t2_val ?? "[TBA]"})\n`;
        details += `  Tier 3: ${acMeta.display_health_tier_3 || "[TBA]"} (Value: ${acMeta.health_t3_val ?? "[TBA]"})\n`;
      }
      // ... other aircraft info_type handlers ...
    }


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
  const lowerCaseQuestion = question.toLowerCase();

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    });
    const [{ embedding }] = embeddingResponse.data;

    console.log('Querying Pinecone with topK=5 for initial semantic matches...');
    const initialPineconeResponse = await pineconeIndex.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    });
    console.log('Initial Pinecone query successful.');

    let finalMatches: ScoredPineconeRecord<BaseMetadata>[] = initialPineconeResponse.matches || [];
    let primaryItemName: string | undefined;
    let isAllPlanesQuery = ALL_PLANES_KEYWORDS.some(keyword => lowerCaseQuestion.includes(keyword));

    if (isAllPlanesQuery) {
      console.log(`"All planes" query detected. Attempting to fetch summary doc: ${ALL_PLANES_SUMMARY_DOC_ID}`);
      // (Logic for fetching ALL_PLANES_SUMMARY_DOC_ID remains the same as previous version)
      try {
        const fetchResponse = await pineconeIndex.fetch([ALL_PLANES_SUMMARY_DOC_ID]);
        const summaryRecord = fetchResponse.records ? fetchResponse.records[ALL_PLANES_SUMMARY_DOC_ID] : undefined;
        if (summaryRecord && summaryRecord.metadata) {
          const summaryMatch: ScoredPineconeRecord<BaseMetadata> = {
            id: summaryRecord.id, score: 1.0, metadata: (summaryRecord.metadata as BaseMetadata),
          };
          finalMatches.unshift(summaryMatch);
          console.log(`Successfully fetched and prepended ${ALL_PLANES_SUMMARY_DOC_ID}.`);
        } else {
          console.log(`Could not fetch or find metadata for summary record ${ALL_PLANES_SUMMARY_DOC_ID}.`);
        }
      } catch (fetchError: any) {
        console.error(`Error fetching summary doc ${ALL_PLANES_SUMMARY_DOC_ID}:`, fetchError.message || fetchError);
      }
    }

    // Try to identify primary item name from initial matches if not an "all planes" query that found its summary
    if (!isAllPlanesQuery || (isAllPlanesQuery && !finalMatches.some(m => m.id === ALL_PLANES_SUMMARY_DOC_ID))) {
        // If it's an "all planes" query but summary failed, or it's not an "all planes" query, try to find a specific item.
        const potentialPrimaryMatch = finalMatches.find(match => match.metadata && match.metadata.item_name && match.metadata.entity_type === 'aircraft');
        if (potentialPrimaryMatch && potentialPrimaryMatch.metadata) {
            primaryItemName = potentialPrimaryMatch.metadata.item_name;
            console.log(`Primary item identified from semantic matches: ${primaryItemName}`);
        }
    }


    if (!primaryItemName && question && !isAllPlanesQuery) {
      const knownItems = ["P-51 Mustang", "MiG-29 Fulcrum", "Spitfire"]; // Ensure "Spitfire" or its variants are here
      for (const item of knownItems) {
        if (lowerCaseQuestion.includes(item.toLowerCase())) {
          primaryItemName = item;
          console.log(`Primary item identified from question keywords: ${primaryItemName}`);
          break;
        }
      }
    }

    if (primaryItemName) { // Only fetch specific item details if a primaryItemName is set
      const itemNameSnakeCase = primaryItemName.toLowerCase().replace(/ /g, '_').replace(/-/g, '_').replace(/\./g, '').replace(/\//g, '_');
      const overviewFullTextId = `${itemNameSnakeCase}_overview_full_text`;
      const generalInfoId = `${itemNameSnakeCase}_general_info`;
      const statSpeedId = `${itemNameSnakeCase}_stat_speed`;
      const statHealthId = `${itemNameSnakeCase}_stat_health`;

      const idsToFetchIfNeeded: string[] = [];

      if (!finalMatches.some(match => match.id === overviewFullTextId)) idsToFetchIfNeeded.push(overviewFullTextId);
      if (!finalMatches.some(match => match.id === generalInfoId)) idsToFetchIfNeeded.push(generalInfoId);

      const requestsSpeed = SPEED_STAT_KEYWORDS.some(kw => lowerCaseQuestion.includes(kw));
      const requestsHealth = HEALTH_STAT_KEYWORDS.some(kw => lowerCaseQuestion.includes(kw));

      if (requestsSpeed && !finalMatches.some(match => match.id === statSpeedId)) {
        idsToFetchIfNeeded.push(statSpeedId);
        console.log(`Query requests speed for ${primaryItemName}. Adding ${statSpeedId} to fetch list.`);
      }
      if (requestsHealth && !finalMatches.some(match => match.id === statHealthId)) {
        idsToFetchIfNeeded.push(statHealthId);
        console.log(`Query requests health for ${primaryItemName}. Adding ${statHealthId} to fetch list.`);
      }
      // If the query is very generic for an item, e.g., "tell me about spitfire", also try to get its detailed stats
      if (!requestsSpeed && !requestsHealth && (lowerCaseQuestion.includes(`about ${primaryItemName.toLowerCase()}`) || lowerCaseQuestion.includes(`stats for ${primaryItemName.toLowerCase()}`))) {
          if (!finalMatches.some(match => match.id === statSpeedId)) idsToFetchIfNeeded.push(statSpeedId);
          if (!finalMatches.some(match => match.id === statHealthId)) idsToFetchIfNeeded.push(statHealthId);
          console.log(`General query for ${primaryItemName}. Adding detailed stat docs to fetch list.`);
      }


      if (idsToFetchIfNeeded.length > 0) {
        console.log(`Attempting to fetch essential/detailed chunks for ${primaryItemName}: ${idsToFetchIfNeeded.join(', ')}...`);
        try {
          const fetchResponse = await pineconeIndex.fetch(idsToFetchIfNeeded);
          if (fetchResponse.records) {
            for (const idToFetch of idsToFetchIfNeeded) {
              const record = fetchResponse.records[idToFetch];
              if (record && record.metadata) {
                const fetchedMatch: ScoredPineconeRecord<BaseMetadata> = {
                  id: record.id, score: 0.98, metadata: (record.metadata as BaseMetadata),
                };
                finalMatches.push(fetchedMatch);
                console.log(`Successfully fetched and added ${idToFetch} to context.`);
              } else {
                console.log(`Could not fetch or find metadata for record ${idToFetch}.`);
              }
            }
          }
        } catch (fetchError: any) {
          console.error(`Error fetching essential/detailed chunks for ${primaryItemName}:`, fetchError.message || fetchError);
        }
      }
    }

    finalMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
    const uniqueMatches = Array.from(new Map(finalMatches.map(match => [match.id, match])).values());
    const limitedMatches = uniqueMatches.slice(0, 10);

    const contexts = formatRetrievedContext(limitedMatches);

    console.log('--- COMBINED CONTEXT FOR OPENAI (first 2000 chars) ---');
    console.log(contexts.length > 0 ? contexts.substring(0, 2000) + (contexts.length > 2000 ? '...' : '') : 'Context is empty.');
    console.log('--- END COMBINED CONTEXT FOR OPENAI ---');

    const system_prompt = `You are an expert assistant for the Roblox game War Tycoon. Your knowledge is based SOLELY on the "Context from Document(s)" provided below.
- Answer the user's "Question" using ONLY this context.
- If the context contains a summary list of items (e.g., from a document like "all_aircraft_summary_info"), use that information to answer questions about "all items."
- For individual items, if the user is seeking an overview (e.g., "tell me about the p-51 plane"), utilize 'overview_full_text' primarily, and supplement with 'general_info' and any available detailed stat chunks (like 'stat_speed', 'stat_health'). Include price/unlock, key stats (overall range AND tiered stats like non-upgraded, Tier 1, Tier 2, Tier 3 if available), armaments, utilities, seating capacity, component counts, spawn parts costs, and strengths/weaknesses if available.
- If detailed tiered stats (non-upgraded, Tier 1, etc.) for speed or health are present in the context, prioritize showing them. The 'Display Speed Range' and 'Display Health Range' from 'general_info' provide an overall summary.
- "parts_cost_hulls", "parts_cost_weapon_systems", and "parts_cost_engines" are spawn/respawn costs.
- If asked for stats, provide all available stats from the context. For comparisons, include all key details for EACH item if context is provided.
- If the context does NOT contain the answer (e.g., specific details for an item not listed, or a comprehensive list if no summary document was found/provided, or tiered stats if only a general range is available), you MUST state that the information is not available in your current knowledge base for that specific question. Do not apologize unless it's a system error.
- Do NOT make up information, use external knowledge, or speculate.
- Synthesize information if multiple documents cover different aspects.
- If context is irrelevant, indicate that. If the question is irrational, ask for clarification.`;

    const user_prompt = `
Context from Document(s):
${contexts}

Question: ${question}

Answer:`;

    console.log("Sending prompt to OpenAI for completion using gpt-4o...");
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system_prompt },
        { role: 'user', content: user_prompt }
      ],
      max_tokens: 1500,
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