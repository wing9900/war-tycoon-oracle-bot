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
const GENERAL_STAT_KEYWORDS = ["stats", "details", "info", "about", "full", "information", "data"];

// --- Known Items and Aliases for better primary item detection ---
interface KnownItem {
  name: string;
  aliases: string[];
  entityType: string; // e.g., 'aircraft', 'tank'
}
const KNOWN_GAME_ITEMS: KnownItem[] = [
  { name: "P-51 Mustang", aliases: ["p-51", "mustang", "p51"], entityType: 'aircraft' },
  { name: "MiG-29 Fulcrum", aliases: ["mig-29", "fulcrum", "mig29"], entityType: 'aircraft' },
  { name: "Spitfire", aliases: ["spitfire", "spit"], entityType: 'aircraft' }
  // Add more items as needed
];


// --- TypeScript Interfaces for Metadata ---
interface BaseMetadata {
  entity_type?: string;
  item_name?: string;
  info_type?: string;
  text_content_source?: string;
  planes_summary?: Array<{ // For the all_aircraft_summary_info document
    name: string;
    price?: number | string;
    unlock_method?: string;
    seating_capacity?: number;
    armament_summary?: string[] | string;
    speed_range?: string;
    health_range?: string;
  }>;
  // Common fields for stat documents (stat_speed, stat_health, etc.)
  unit?: string;
  display_speed_non_upgraded?: string; speed_nu_val?: number | string;
  display_speed_tier_1?: string; speed_t1_val?: number | string;
  display_speed_tier_2?: string; speed_t2_val?: number | string;
  display_speed_tier_3?: string; speed_t3_val?: number | string;
  display_health_non_upgraded?: string; health_nu_val?: number | string;
  display_health_tier_1?: string; health_t1_val?: number | string;
  display_health_tier_2?: string; health_t2_val?: number | string;
  display_health_tier_3?: string; health_t3_val?: number | string;
  [key: string]: any; // Allows other fields not explicitly defined
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
    const acMeta = metadata as any; // Using 'any' for flexibility with diverse metadata structures

    if (id === ALL_PLANES_SUMMARY_DOC_ID && acMeta.planes_summary && Array.isArray(acMeta.planes_summary)) {
      details += "Summary of All Aircraft:\n";
      acMeta.planes_summary.forEach((plane: any) => {
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
        if (acMeta.speed_min_display || acMeta.speed_max_display) {
             details += `Display Speed Range: ${acMeta.speed_min_display || '[TBA]'} - ${acMeta.speed_max_display || '[TBA]'} MPH\n`;
        }
        if (acMeta.health_min_display || acMeta.health_max_display) {
            details += `Display Health Range: ${acMeta.health_min_display || '[TBA]'} - ${acMeta.health_max_display || '[TBA]'} HP\n`;
        }
      } else if (acMeta.info_type === 'stat_speed') {
        details += `Detailed Speed Stats (Unit: ${acMeta.unit || "N/A"}):\n`;
        if (acMeta.display_speed_non_upgraded !== undefined) details += `  Non-Upgraded: ${acMeta.display_speed_non_upgraded} (Value: ${acMeta.speed_nu_val ?? "[TBA]"})\n`;
        if (acMeta.display_speed_tier_1 !== undefined) details += `  Tier 1: ${acMeta.display_speed_tier_1} (Value: ${acMeta.speed_t1_val ?? "[TBA]"})\n`;
        if (acMeta.display_speed_tier_2 !== undefined) details += `  Tier 2: ${acMeta.display_speed_tier_2} (Value: ${acMeta.speed_t2_val ?? "[TBA]"})\n`;
        if (acMeta.display_speed_tier_3 !== undefined) details += `  Tier 3: ${acMeta.display_speed_tier_3} (Value: ${acMeta.speed_t3_val ?? "[TBA]"})\n`;
      } else if (acMeta.info_type === 'stat_health') {
        details += `Detailed Health Stats (Unit: ${acMeta.unit || "N/A"}):\n`;
        if (acMeta.display_health_non_upgraded !== undefined) details += `  Non-Upgraded: ${acMeta.display_health_non_upgraded} (Value: ${acMeta.health_nu_val ?? "[TBA]"})\n`;
        if (acMeta.display_health_tier_1 !== undefined) details += `  Tier 1: ${acMeta.display_health_tier_1} (Value: ${acMeta.health_t1_val ?? "[TBA]"})\n`;
        if (acMeta.display_health_tier_2 !== undefined) details += `  Tier 2: ${acMeta.display_health_tier_2} (Value: ${acMeta.health_t2_val ?? "[TBA]"})\n`;
        if (acMeta.display_health_tier_3 !== undefined) details += `  Tier 3: ${acMeta.display_health_tier_3} (Value: ${acMeta.health_t3_val ?? "[TBA]"})\n`;
      }
       else if (acMeta.info_type === 'armament_description') {
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
    console.log('Initial Pinecone query successful. Matches found:', initialPineconeResponse.matches?.length || 0);

    let finalMatches: ScoredPineconeRecord<BaseMetadata>[] = initialPineconeResponse.matches || [];
    let primaryItemName: string | undefined;
    let primaryItemEntityType: string | undefined;

    const isAllPlanesQuery = ALL_PLANES_KEYWORDS.some(keyword => lowerCaseQuestion.includes(keyword));

    if (isAllPlanesQuery) {
      console.log(`"All planes" query detected. Attempting to fetch summary doc: ${ALL_PLANES_SUMMARY_DOC_ID}`);
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

    if (!isAllPlanesQuery || (isAllPlanesQuery && !finalMatches.some(m => m.id === ALL_PLANES_SUMMARY_DOC_ID))) {
        for (const match of finalMatches) {
            if (match.metadata?.item_name && match.metadata?.entity_type) {
                const foundKnownItem = KNOWN_GAME_ITEMS.find(knownItem => {
                    const itemNameInQuery = lowerCaseQuestion.includes(knownItem.name.toLowerCase()) ||
                                          knownItem.aliases.some(alias => lowerCaseQuestion.includes(alias.toLowerCase()));
                    return itemNameInQuery && knownItem.name.toLowerCase() === match.metadata.item_name.toLowerCase();
                });

                if (foundKnownItem) {
                    primaryItemName = foundKnownItem.name;
                    primaryItemEntityType = foundKnownItem.entityType;
                    console.log(`Primary item "${primaryItemName}" (Type: ${primaryItemEntityType}) identified from semantic match and question keywords.`);
                    break; 
                }
            }
        }
    }
    
    if (!primaryItemName && !isAllPlanesQuery) {
      for (const item of KNOWN_GAME_ITEMS) {
        if (lowerCaseQuestion.includes(item.name.toLowerCase())) {
          primaryItemName = item.name;
          primaryItemEntityType = item.entityType;
          break;
        }
        for (const alias of item.aliases) {
          if (lowerCaseQuestion.includes(alias.toLowerCase())) {
            primaryItemName = item.name;
            primaryItemEntityType = item.entityType;
            break;
          }
        }
        if (primaryItemName) break;
      }
      if (primaryItemName) {
        console.log(`Primary item "${primaryItemName}" (Type: ${primaryItemEntityType}) identified purely from question keywords/aliases.`);
      }
    }


    if (primaryItemName && primaryItemEntityType === 'aircraft') {
      const itemNameSnakeCase = primaryItemName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_');
      const overviewFullTextId = `${itemNameSnakeCase}_overview_full_text`;
      const generalInfoId = `${itemNameSnakeCase}_general_info`;
      const statSpeedId = `${itemNameSnakeCase}_stat_speed`;
      const statHealthId = `${itemNameSnakeCase}_stat_health`;

      const idsToFetchIfNeeded: string[] = [];

      if (!finalMatches.some(match => match.id === overviewFullTextId)) idsToFetchIfNeeded.push(overviewFullTextId);
      if (!finalMatches.some(match => match.id === generalInfoId)) idsToFetchIfNeeded.push(generalInfoId);

      const requestsSpecificSpeed = SPEED_STAT_KEYWORDS.some(kw => lowerCaseQuestion.includes(kw));
      const requestsSpecificHealth = HEALTH_STAT_KEYWORDS.some(kw => lowerCaseQuestion.includes(kw));
      
      let requestsGeneralItemStats = false;
      const primaryItemKeywords = [primaryItemName.toLowerCase(), ...(KNOWN_GAME_ITEMS.find(i => i.name === primaryItemName)?.aliases || [])];
      if (primaryItemKeywords.some(pik => lowerCaseQuestion.includes(pik))) {
          if (GENERAL_STAT_KEYWORDS.some(gsk => lowerCaseQuestion.includes(gsk))) {
              requestsGeneralItemStats = true;
          }
      }
      
      console.log(`For ${primaryItemName}: requestsSpecificSpeed=${requestsSpecificSpeed}, requestsSpecificHealth=${requestsSpecificHealth}, requestsGeneralItemStats=${requestsGeneralItemStats}`);

      if (requestsSpecificSpeed || requestsGeneralItemStats) {
        if (!finalMatches.some(match => match.id === statSpeedId)) {
          idsToFetchIfNeeded.push(statSpeedId);
          console.log(`Adding ${statSpeedId} to fetch list for ${primaryItemName}.`);
        }
      }
      if (requestsSpecificHealth || requestsGeneralItemStats) {
        if (!finalMatches.some(match => match.id === statHealthId)) {
          idsToFetchIfNeeded.push(statHealthId);
          console.log(`Adding ${statHealthId} to fetch list for ${primaryItemName}.`);
        }
      }

      if (idsToFetchIfNeeded.length > 0) {
        console.log(`Attempting to fetch specific docs for ${primaryItemName}: ${idsToFetchIfNeeded.join(', ')}...`);
        try {
          const fetchResponse = await pineconeIndex.fetch(idsToFetchIfNeeded);
          if (fetchResponse.records) {
            for (const idToFetch of idsToFetchIfNeeded) {
              const record = fetchResponse.records[idToFetch];
              if (record && record.metadata) {
                const fetchedMatch: ScoredPineconeRecord<BaseMetadata> = {
                  id: record.id, score: 0.99, 
                  metadata: (record.metadata as BaseMetadata),
                };
                finalMatches.push(fetchedMatch);
                console.log(`Successfully fetched and added ${idToFetch} to context for ${primaryItemName}.`);
              } else {
                console.log(`Could not fetch or find metadata for specific record ${idToFetch} for ${primaryItemName}.`);
              }
            }
          }
        } catch (fetchError: any) {
          console.error(`Error fetching specific docs for ${primaryItemName}:`, fetchError.message || fetchError);
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
- If detailed tiered stats (non-upgraded, Tier 1, etc.) for speed or health are present in the context (usually from 'stat_speed' or 'stat_health' info_type), prioritize showing them clearly. The 'Display Speed Range' and 'Display Health Range' from 'general_info' provide an overall summary and can be mentioned as well.
- "parts_cost_hulls", "parts_cost_weapon_systems", and "parts_cost_engines" are spawn/respawn costs.
- If asked for stats, provide all available stats from the context in a clear, organized, and easy-to-read format. Use bullet points or descriptive paragraphs for different categories of information. Avoid complex table structures unless the data is very extensive and a table is the only clear way.
- For tiered stats (Non-Upgraded, Tier 1, Tier 2, Tier 3), list them clearly, for example:
  Speed:
  - Non-Upgraded: [Value]
  - Tier 1: [Value]
  - Tier 2: [Value]
  - Tier 3: [Value]
- If the context does NOT contain the answer (e.g., specific details for an item not listed, or a comprehensive list if no summary document was found/provided, or tiered stats if only a general range is available), you MUST state that the information is not available in your current knowledge base for that specific question. Do not apologize unless it's a system error. If some data points are missing, indicate 'N/A' or 'Not specified' for that specific data point.
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
      max_tokens: 2000, 
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