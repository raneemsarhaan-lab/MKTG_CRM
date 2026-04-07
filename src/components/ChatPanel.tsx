import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getGeminiResponse } from '../services/gemini';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatPanel: React.FC = () => {
  const { tasks, teamMembers, taskTypes, notificationRules, addTask, updateTask } = useStore();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I am your **Marketing Ops Assistant**. I'm here to help your strategy consulting firm manage marketing workflows, track SLAs, and generate perfectly formatted notifications for Google Chat and email.\n\nTo get started, would you like to **Configure** settings or **Operate** by managing tasks?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFunctionCall = async (name: string, args: any) => {
    if (name === 'create_task') {
      const newTask = addTask(args);
      return { success: true, task: newTask, message: `Task "${args.name}" created successfully.` };
    }
    if (name === 'update_task_status') {
      updateTask(args.id, { status: args.status });
      return { success: true, message: `Task status updated to ${args.status}.` };
    }
    if (name === 'list_tasks') {
      let filtered = tasks;
      if (args.status) filtered = filtered.filter(t => t.status === args.status);
      if (args.owner) filtered = filtered.filter(t => t.owner === args.owner);
      return { tasks: filtered };
    }
    return { error: 'Unknown function' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await getGeminiResponse(
        userMessage,
        { tasks, teamMembers, taskTypes, notificationRules },
        handleFunctionCall
      );
      setMessages(prev => [...prev, { role: 'assistant', content: response || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <Bot className="w-5 h-5 text-indigo-600" />
        <h2 className="font-semibold text-gray-800">Marketing Ops Assistant</h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={cn(
            "flex gap-3 max-w-[85%]",
            m.role === 'user' ? "ml-auto flex-row-reverse" : ""
          )}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              m.role === 'assistant' ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-600"
            )}>
              {m.role === 'assistant' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className={cn(
              "p-3 rounded-2xl text-sm",
              m.role === 'assistant' ? "bg-gray-100 text-gray-800 rounded-tl-none" : "bg-indigo-600 text-white rounded-tr-none"
            )}>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything... (e.g. 'Create a LinkedIn post task')"
            className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
