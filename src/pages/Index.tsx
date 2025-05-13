
import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import FireBorder from '@/components/FireBorder';
import { askQuestion } from '@/lib/ai';

const Index = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!question.trim()) {
      return;
    }

    try {
      setLoading(true);
      setAnswer('');
      
      const response = await askQuestion(question);
      setAnswer(response);
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
    <div className="min-h-screen bg-black flex flex-col items-center pt-16 px-4">
      <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-orange-500 to-red-700 mb-16 text-center tracking-wider">
        WAR TYCOON
        <span className="block text-4xl md:text-5xl mt-2">AGENT</span>
      </h1>

      <div className="w-full max-w-3xl mt-auto mb-auto">
        {answer && (
          <div className="mb-8 p-6 rounded-lg bg-gradient-to-b from-gray-900 to-black border border-orange-900/40 text-orange-100">
            {answer}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="relative w-full">
          <FireBorder>
            <div className="flex items-center w-full rounded-lg bg-black/80 border border-orange-900/40">
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
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </FireBorder>
        </form>
      </div>

      <div className="h-32"></div>
    </div>
  );
};

export default Index;
