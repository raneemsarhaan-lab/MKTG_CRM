import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Mail, MessageSquare, Shield, Trash2, X, Plus, Save, Edit2 } from 'lucide-react';
import { TeamMember } from '../types';
import { cn } from '../lib/utils';

export const TeamView: React.FC = () => {
  const { teamMembers, addTeamMember, updateTeamMember, deleteTeamMember } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [formData, setFormData] = useState<TeamMember>({
    name: '',
    role: '',
    email: '',
    google_chat_id: '',
    is_admin: false,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      role: '',
      email: '',
      google_chat_id: '',
      is_admin: false,
    });
    setIsAdding(false);
    setEditingEmail(null);
  };

  const handleEdit = (member: TeamMember) => {
    setFormData(member);
    setEditingEmail(member.email);
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    
    if (editingEmail) {
      updateTeamMember(editingEmail, formData);
    } else {
      addTeamMember(formData);
    }
    resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Team Members</h3>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
          >
            <Plus className="w-4 h-4" /> Add Member
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-gray-900">{editingEmail ? 'Edit Team Member' : 'New Team Member'}</h4>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
              <input 
                required
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Role</label>
              <input 
                required
                type="text"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
              <input 
                required
                disabled={!!editingEmail}
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Google Chat ID</label>
              <input 
                required
                type="text"
                value={formData.google_chat_id}
                onChange={e => setFormData({ ...formData, google_chat_id: e.target.value })}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3 py-2">
              <input 
                type="checkbox"
                id="is_admin"
                checked={formData.is_admin}
                onChange={e => setFormData({ ...formData, is_admin: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
              />
              <label htmlFor="is_admin" className="text-sm font-medium text-gray-700">Grant Administrator Privileges</label>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> {editingEmail ? 'Save Changes' : 'Save Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {teamMembers.map((member) => (
          <div key={member.email} className="group bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4 hover:border-indigo-200 transition-all">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <span className="text-lg font-bold">{member.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{member.name}</h3>
                  {member.is_admin ? (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full flex items-center gap-1 shrink-0">
                      <Shield className="w-3 h-3" /> ADMIN
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full shrink-0">
                      MEMBER
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(member)}
                    className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteTeamMember(member.email)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4">{member.role}</p>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{member.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                  <span>{member.google_chat_id}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
