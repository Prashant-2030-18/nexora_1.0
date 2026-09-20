import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Sparkles, X, Send, CornerDownLeft, Loader2,
  CheckCircle2, ArrowRight, ShieldCheck, Database, Layers
} from 'lucide-react';
import { api } from '../services/api';
import { useGPS } from '../context/GPSContext';
import { AICopilotResponse } from '../types';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  dataPoints?: Record<string, any>[];
  suggestedActions?: { label: string; action: string }[];
  time: string;
}

export const AICopilotDrawer: React.FC = () => {
  const { gps, selectedTravelMode } = useGPS();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: "👋 Welcome to **NER Intelligence Copilot**.\n\nI am connected directly to real-time GIS, logistics, and disaster telemetry across all 8 North Eastern states.\n\nHow can I assist your logistics operations or policy planning today?",
      suggestedActions: [
        { label: "Check Low Accessibility Districts", action: "/accessibility" },
        { label: "Where should MDoNER invest?", action: "/hub-planner" }
      ],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const samplePrompts = [
    "Which districts in Assam have poor accessibility?",
    "Find the safest route from Guwahati to Imphal.",
    "Which routes are currently affected by heavy rainfall?",
    "Where should MDoNER prioritize logistics investment?",
    "What happens if NH-6 is closed?",
    "Which state has the lowest accessibility?"
  ];

  const handleSend = async (textToSend?: string) => {
    const messageText = textToSend || query;
    if (!messageText.trim() || isLoading) return;

    const userMsg: Message = {
      sender: 'user',
      text: messageText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsLoading(true);

    try {
      const navContext = {
        travel_mode: selectedTravelMode,
        gps_speed_kmh: gps.currentSpeedKmh,
        speed_source: gps.speedSource,
        gps_lat: gps.latitude,
        gps_lon: gps.longitude,
        gps_accuracy_m: gps.accuracy,
      };
      const res = await api.queryCopilot(messageText, 'All', 'admin', navContext);
      const assistantMsg: Message = {
        sender: 'assistant',
        text: res.answer,
        dataPoints: res.data_points,
        suggestedActions: res.suggested_actions,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error("AI Copilot query error:", err);
      const errorMsg: Message = {
        sender: 'assistant',
        text: "⚠️ Connection error while querying the NER Intelligence Database. Please ensure backend is running.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMarkdown = (content: string) => {
    // Basic markdown formatting for bullets and bolding
    return content.split('\n').map((line, idx) => {
      let formattedLine = line;
      // Bold
      formattedLine = formattedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Code
      formattedLine = formattedLine.replace(/`(.*?)`/g, '<code class="bg-slate-800 text-sky-300 px-1 py-0.5 rounded text-xs">$1</code>');
      
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="font-bold text-sky-400 text-sm mt-2 mb-1" dangerouslySetInnerHTML={{ __html: formattedLine.replace('### ', '') }} />;
      }
      if (line.startsWith('• ') || line.startsWith('- ')) {
        return <li key={idx} className="ml-4 list-disc text-slate-200 text-xs my-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine.substring(2) }} />;
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }
      return <p key={idx} className="text-xs text-slate-200 my-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
    });
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[1900] flex items-center gap-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold p-3.5 sm:px-5 sm:py-3.5 rounded-full shadow-2xl border border-sky-300/40 glow-sky transition-all hover:scale-105 active:scale-95 group"
      >
        <div className="relative">
          <Bot className="w-5 h-5 text-white animate-bounce" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-slate-900"></span>
        </div>
        <span className="hidden sm:inline text-sm font-semibold tracking-wide">NER Copilot</span>
      </button>

      {/* Slide-out Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-[2500] flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-sm">NER Intelligence Copilot</h3>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-semibold">
                      SQLite Live Connected
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Autonomous Decision Support & GIS Reasoning</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Prompts */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800/80 overflow-x-auto whitespace-nowrap flex gap-1.5 scrollbar-thin">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p)}
                  className="text-[11px] bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-sky-300 border border-slate-700/60 px-3 py-1.5 rounded-full transition-all flex-shrink-0"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Chat message stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1 px-1">
                    <span>{m.sender === 'user' ? 'You' : 'NER Copilot'}</span>
                    <span>•</span>
                    <span>{m.time}</span>
                  </div>
                  
                  <div
                    className={`max-w-[92%] rounded-2xl p-3.5 text-xs shadow-md ${
                      m.sender === 'user'
                        ? 'bg-sky-600 text-white rounded-tr-none'
                        : 'bg-slate-800/90 text-slate-100 border border-slate-700/70 rounded-tl-none'
                    }`}
                  >
                    {m.sender === 'user' ? (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <div className="prose prose-invert max-w-none">
                        {formatMarkdown(m.text)}
                      </div>
                    )}

                    {/* Data Points cards if returned */}
                    {m.dataPoints && m.dataPoints.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-700/80 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          <Database className="w-3 h-3 text-sky-400" />
                          <span>Structured Database Records</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {m.dataPoints.slice(0, 3).map((dp, i) => (
                            <div key={i} className="bg-slate-900/90 p-2 rounded-lg border border-slate-700/50 text-[11px] text-slate-300">
                              {Object.entries(dp).map(([k, v]) => (
                                <span key={k} className="mr-3 inline-block">
                                  <span className="text-slate-400 capitalize">{k.replace('_', ' ')}:</span> <strong className="text-sky-300">{String(v)}</strong>
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested Action Buttons */}
                    {m.suggestedActions && m.suggestedActions.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-700/80 flex flex-wrap gap-1.5">
                        {m.suggestedActions.map((act, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              navigate(act.action);
                              setIsOpen(false);
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium bg-sky-950 text-sky-300 hover:bg-sky-900 px-2.5 py-1 rounded-lg border border-sky-700/60 transition-colors"
                          >
                            <span>{act.label}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 p-3 rounded-2xl w-fit border border-slate-700/50">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Querying SQLite GIS & Logistics Engine...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-slate-800 bg-slate-950">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask about accessibility, routes, disaster risks, or hub siting..."
                  className="flex-1 bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || isLoading}
                  className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 p-2.5 rounded-xl font-bold transition-all shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1">
                <span>Direct DB Context • MDoNER Knowledge Graph</span>
                <span>Powered by NER Autonomous GIS Engine</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
