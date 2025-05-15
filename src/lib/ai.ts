import { toast } from 'sonner';

/**
 * Fetches an answer from the AI by connecting to Pinecone and OpenAI
 * 
 * @param question The user's question about War Tycoon
 * @returns The AI's response
 */
export const askQuestion = async (question: string): Promise<string> => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      throw new Error('Failed to get answer from backend');
    }

    const data = await response.json();
    return data.answer || 'Sorry, I could not generate an answer.';
  } catch (error) {
    console.error("Error in askQuestion:", error);
    throw new Error("Failed to get answer from AI");
  }
};
