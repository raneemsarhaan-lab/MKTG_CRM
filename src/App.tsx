import React, { useState } from 'react';
import { StoreProvider } from './store/useStore';
import { ChatPanel } from './components/ChatPanel';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { TaskListView } from './components/TaskListView';
import { TeamView } from './components/TeamView';
import { SettingsView } from './components/SettingsView';
import { LayoutDashboard, Calendar, MessageSquare, Users, Settings, ClipboardList } from 'lucide-react';
import { cn } from './lib/utils';

type View = 'dashboard' | 'calendar' | 'tasks' | 'team' | 'settings';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'tasks', label: 'Task List', icon: ClipboardList },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <StoreProvider>
      <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">Marketing Ops</h1>
                <p className="text-xs text-gray-500 font-medium">Assistant v1.0</p>
              </div>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id as View)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    activeView === item.id
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto p-6 border-t border-gray-100">
            <button 
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all",
                isChatOpen 
                  ? "bg-gray-900 text-white shadow-lg shadow-gray-200" 
                  : "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              {isChatOpen ? 'Close Assistant' : 'Open Assistant'}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0">
            <h2 className="text-xl font-bold text-gray-800 capitalize">{activeView.replace('-', ' ')}</h2>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                    <img src={`https://picsum.photos/seed/user${i}/32/32`} alt="User" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
              <div className="h-8 w-px bg-gray-200 mx-2" />
              <button className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign Out</button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-6xl mx-auto">
              {activeView === 'dashboard' && <Dashboard />}
              {activeView === 'calendar' && <CalendarView />}
              {activeView === 'tasks' && <TaskListView />}
              {activeView === 'team' && <TeamView />}
              {activeView === 'settings' && <SettingsView />}
            </div>
          </div>
        </main>

        {/* Chat Panel (Assistant) */}
        {isChatOpen && (
          <aside className="w-96 shrink-0">
            <ChatPanel />
          </aside>
        )}
      </div>
    </StoreProvider>
  );
}
