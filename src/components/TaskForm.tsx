import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { X, Save, Calendar, User, Tag, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Task } from '../types';

interface TaskFormProps {
  onClose: () => void;
  taskToEdit?: Task;
}

export const TaskForm: React.FC<TaskFormProps> = ({ onClose, taskToEdit }) => {
  const { taskTypes, teamMembers, addTask, updateTask } = useStore();
  
  const [formData, setFormData] = useState({
    name: taskToEdit?.name || '',
    type: taskToEdit?.type || taskTypes[0]?.name || '',
    owner: taskToEdit?.owner || teamMembers[0]?.name || '',
    stakeholders: taskToEdit?.stakeholders || [] as string[],
    start_date: taskToEdit?.start_date || format(new Date(), 'yyyy-MM-dd'),
    publishing_date: taskToEdit?.publishing_date || '',
    notes: taskToEdit?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.type || !formData.owner) return;
    
    if (taskToEdit) {
      updateTask(taskToEdit.id, formData);
    } else {
      addTask({
        ...formData,
        created_date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-xl font-bold text-gray-900">
            {taskToEdit ? 'Edit Task' : 'Create New Task'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5" /> Task Name
            </label>
            <input 
              autoFocus
              required
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Q2 Strategy LinkedIn Post"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Tag className="w-3.5 h-3.5" /> Category
              </label>
              <select 
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              >
                {taskTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <User className="w-3.5 h-3.5" /> Owner
              </label>
              <select 
                value={formData.owner}
                onChange={e => setFormData({ ...formData, owner: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              >
                {teamMembers.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5" /> Start Date
              </label>
              <input 
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5" /> Publish Date (Opt)
              </label>
              <input 
                type="date"
                value={formData.publishing_date}
                onChange={e => setFormData({ ...formData, publishing_date: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
              Notes
            </label>
            <textarea 
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Any additional details..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all resize-none"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> {taskToEdit ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
