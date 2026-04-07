import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { format, parseISO, isAfter } from 'date-fns';
import { Edit2, CheckCircle2, Circle, AlertCircle, Trash2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { TaskForm } from './TaskForm';
import { Task } from '../types';

export const TaskListView: React.FC = () => {
  const { tasks, updateTask, deleteTask } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">All Marketing Tasks</h3>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
        >
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {isAdding && <TaskForm onClose={() => setIsAdding(false)} />}
      {editingTask && <TaskForm taskToEdit={editingTask} onClose={() => setEditingTask(null)} />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Task Name</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Publish Date</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500 text-sm">
                  No tasks yet. Ask the assistant to create one!
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const isAtRisk = task.publishing_date && isAfter(parseISO(task.due_date), parseISO(task.publishing_date));
                
                return (
                  <tr key={task.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => updateTask(task.id, { status: task.status === 'Done' ? 'Not started' : 'Done' })}
                        className={cn(
                          "transition-colors",
                          task.status === 'Done' ? "text-green-500" : "text-gray-300 hover:text-indigo-500"
                        )}
                      >
                        {task.status === 'Done' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={cn("text-sm font-medium", task.status === 'Done' ? "text-gray-400 line-through" : "text-gray-900")}>
                          {task.name}
                        </span>
                        {isAtRisk && (
                          <span className="text-[10px] text-red-500 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" /> Publishing Risk: SLA exceeds publish date
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                        {task.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{task.owner}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {format(parseISO(task.due_date), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {task.publishing_date ? format(parseISO(task.publishing_date), 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setEditingTask(task)}
                          className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit Task"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
