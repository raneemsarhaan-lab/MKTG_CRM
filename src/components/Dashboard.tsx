import React from 'react';
import { useStore } from '../store/useStore';
import { CheckCircle2, Clock, AlertTriangle, Calendar as CalendarIcon, Users, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';

export const Dashboard: React.FC = () => {
  const { tasks, teamMembers, getOverdueTasks, getTasksDueSoon } = useStore();
  
  const overdue = getOverdueTasks();
  const dueSoon = getTasksDueSoon();
  const completed = tasks.filter(t => t.status === 'Done');
  const active = tasks.filter(t => t.status !== 'Done');

  const stats = [
    { label: 'Active Tasks', value: active.length, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Overdue', value: overdue.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Due Soon', value: dueSoon.length, icon: CalendarIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Completed', value: completed.length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className={cn("p-3 rounded-lg", stat.bg)}>
              <stat.icon className={cn("w-6 h-6", stat.color)} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Tasks */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Urgent & Overdue
            </h3>
            <span className="text-xs text-gray-500">{overdue.length + dueSoon.length} items</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {[...overdue, ...dueSoon].length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No urgent tasks at the moment.</div>
            ) : (
              [...overdue, ...dueSoon].map(task => (
                <div key={task.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-medium text-gray-900">{task.name}</h4>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase",
                      task.status === 'Overdue' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {task.status === 'Overdue' ? 'Overdue' : 'Due Soon'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {task.owner}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" /> {format(parseISO(task.due_date), 'MMM d')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team Activity */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Team Workload
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {teamMembers.map(member => {
              const memberTasks = tasks.filter(t => t.owner === member.name && t.status !== 'Done');
              const progress = tasks.length > 0 ? (memberTasks.length / active.length) * 100 : 0;
              
              return (
                <div key={member.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{member.name}</span>
                    <span className="text-gray-500">{memberTasks.length} active tasks</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
