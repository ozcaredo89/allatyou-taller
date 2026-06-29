import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export const AIChatDrawer: React.FC<AIChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  setMessages
}) => {
  const { token } = useAuth();
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      if (messages.length === 0) {
         // Auto-greeting when opened for the first time
         const greetingMessage: Message = {
            role: 'model',
            parts: [{ text: "¡Hola! Soy el Administrador Virtual de tu taller. ¿En qué puedo ayudarte hoy?" }]
         };
         setMessages([greetingMessage]);

         // Optionally, we could ask the backend to trigger an initial context-based greeting
         // but a simple local greeting works, and subsequent user messages will pull the data.
      }
    }
  }, [isOpen, messages.length]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !token) return;

    const userMessage: Message = {
      role: 'user',
      parts: [{ text: text.trim() }]
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messages: newMessages })
      });

      if (!response.ok) {
        throw new Error('Error al comunicar con la IA');
      }

      const data = await response.json();

      const aiMessage: Message = {
        role: 'model',
        parts: [{ text: data.text }]
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      const errorMessage: Message = {
        role: 'model',
        parts: [{ text: "Lo siento, ha ocurrido un error de conexión." }]
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputText);
  };

  const handleSuggestionClick = (suggestionText: string) => {
    setInputText(suggestionText);
    handleSendMessage(suggestionText);
  };

  // Helper to parse suggestions from text
  const renderMessageContent = (text: string) => {
    // Regex to find [SUGERENCIA: texto]
    const suggestionRegex = /\[SUGERENCIA:\s*(.*?)\]/g;
    const suggestions: string[] = [];

    // The text splits will alternate: text, suggestion1, text, suggestion2, text...
    let cleanText = '';

    // We manually extract them to keep the text clean
    const rawMatches = [...text.matchAll(suggestionRegex)];

    if (rawMatches.length > 0) {
      // Remove the exact [SUGERENCIA: xxx] blocks from the display text
      cleanText = text.replace(suggestionRegex, '').trim();
      suggestions.push(...rawMatches.map(m => m[1]));
    } else {
      cleanText = text;
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="whitespace-pre-wrap text-sm">{cleanText}</div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestionClick(sug)}
                className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1 rounded-full transition-colors border border-indigo-200"
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="p-1.5 bg-indigo-100 rounded-md">
              <Bot size={20} className="text-indigo-600" />
            </div>
            <h2 className="font-semibold text-lg">Asistente Virtual</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 mt-1 flex items-center justify-center w-8 h-8 rounded-full ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                  {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                </div>
                <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'}`}>
                  {renderMessageContent(msg.parts[0].text)}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start">
               <div className="flex gap-2 max-w-[85%]">
                 <div className="flex-shrink-0 mt-1 flex items-center justify-center w-8 h-8 rounded-full bg-slate-800">
                   <Bot size={16} className="text-white" />
                 </div>
                 <div className="p-4 rounded-2xl bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm flex items-center gap-1">
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                 </div>
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Haz una pregunta..."
              className="flex-1 px-4 py-2 bg-slate-100 border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              <Send size={20} className="ml-1" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
