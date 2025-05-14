
import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { ArrowUp } from 'lucide-react';
import FireBorder from '@/components/FireBorder';
import { askQuestion } from '@/lib/ai';
import { ScrollArea } from '@/components/ui/scroll-area';

const Index = () => {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{type: 'user' | 'ai', content: string}>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!question.trim()) {
      return;
    }

    try {
      setLoading(true);
      // Add user message
      setMessages(prev => [...prev, {type: 'user', content: question}]);
      
      const response = await askQuestion(question);
      
      // Add AI response
      setMessages(prev => [...prev, {type: 'ai', content: response}]);
      setQuestion('');
    } catch (error) {
      console.error('Error getting answer:', error);
      toast.error('Failed to get an answer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-orange-500 to-red-700 py-8 text-center tracking-wider whitespace-nowrap">
        WAR TYCOON AI AGENT
      </h1>

      <div className="flex-grow overflow-hidden px-4 mb-4">
        <ScrollArea className="h-full max-h-[calc(100vh-220px)]">
          <div className="pr-4 pb-4">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`mb-4 p-4 rounded-lg ${
                  msg.type === 'user' 
                    ? 'bg-gradient-to-r from-orange-900/30 to-red-900/30 text-orange-200 ml-12' 
                    : 'bg-gradient-to-b from-gray-900 to-black border border-orange-900/40 text-orange-100'
                }`}
              >
                {msg.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="w-full px-4 pb-6">
        <form onSubmit={handleSubmit} className="relative w-full">
          <FireBorder>
            <div className="flex items-center w-full rounded-lg bg-black border border-orange-900/40">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to know about War Tycoon?"
                className="flex-1 bg-transparent text-gray-300 p-6 outline-none placeholder:text-gray-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center h-12 w-12 mr-2 rounded-lg bg-gradient-to-b from-orange-600 to-red-700 text-white hover:from-orange-500 hover:to-red-600 transition-all duration-300 disabled:opacity-50"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
          </FireBorder>
        </form>
      </div>
    </div>
  );
};

export default Index;
