import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { TaskType } from '../types';

export const TaskTypeManager: React.FC = () => {
  const { taskTypes, addTaskType, updateTaskType, deleteTaskType, teamMembers } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<TaskType>({
    name: '',
    sla_days: 1,
    default_owner: teamMembers[0]?.name || '',
    default_stakeholders: [],
    reminder_days_before: 1,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      sla_days: 1,
      default_owner: teamMembers[0]?.name || '',
      default_stakeholders: [],
      reminder_days_before: 1,
    });
    setIsAdding(false);
    setEditingType(null);
  };

  const handleSave = () => {
    if (!formData.name) return;
    
    if (editingType) {
      updateTaskType(editingType, formData);
    } else {
      addTaskType(formData);
    }
    resetForm();
  };

  const startEdit = (type: TaskType) => {
    setFormData(type);
    setEditingType(type.name);
    setIsAdding(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-gray-900">Task Categories & SLAs</h3>
          <p className="text-sm text-gray-500">Configure how different tasks are handled by default.</p>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-bold text-indigo-900">{editingType ? 'Edit Category' : 'New Category'}</h4>
            <button onClick={resetForm} className="text-indigo-400 hover:text-indigo-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-700 uppercase">Category Name</label>
              <input 
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. LinkedIn Post"
                className="w-full px-4 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-700 uppercase">SLA (Days)</label>
              <input 
                type="number"
                value={formData.sla_days}
                onChange={e => setFormData({ ...formData, sla_days: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-700 uppercase">Default Owner</label>
              <select 
                value={formData.default_owner}
                onChange={e => setFormData({ ...formData, default_owner: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                {teamMembers.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-700 uppercase">Reminder (Days Before)</label>
              <input 
                type="number"
                value={formData.reminder_days_before}
                onChange={e => setFormData({ ...formData, reminder_days_before: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={resetForm} className="px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> {editingType ? 'Update' : 'Save Category'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {taskTypes.map((type) => (
          <div key={type.name} className="group relative bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-3">
              <h4 className="font-bold text-gray-900">{type.name}</h4>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => startEdit(type)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => deleteTaskType(type.name)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SLA</span>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{type.sla_days} Days</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Owner</span>
                <span className="text-xs text-gray-700 font-medium">{type.default_owner}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Reminder</span>
                <span className="text-xs text-gray-700 font-medium">{type.reminder_days_before}d before</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
