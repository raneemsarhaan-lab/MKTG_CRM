import React from 'react';
import { useStore } from '../store/useStore';
import { Bell, Shield, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { TaskTypeManager } from './TaskTypeManager';

export const SettingsView: React.FC = () => {
  const { notificationRules, updateNotificationRules } = useStore();

  const rules = [
    { id: 'new_task_gchat', label: 'New Task (Google Chat)', icon: Bell },
    { id: 'new_task_email', label: 'New Task (Email)', icon: Bell },
    { id: 'morning_briefing_gchat', label: 'Morning Briefing', icon: Clock },
    { id: 'sla_reminder_gchat', label: 'SLA Reminders', icon: Clock },
    { id: 'overdue_reminder_gchat', label: 'Overdue Reminders', icon: Shield },
    { id: 'overdue_email_escalation', label: 'Overdue Escalation', icon: Shield },
    { id: 'weekly_digest_email', label: 'Weekly Digest', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">Notification Rules</h3>
          <p className="text-sm text-gray-500">Configure how and when the assistant sends alerts.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {rules.map((rule) => (
            <div key={rule.id} className="p-6 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                  <rule.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{rule.label}</p>
                  <p className="text-xs text-gray-500">Automated notification triggered by system events.</p>
                </div>
              </div>
              <button
                onClick={() => updateNotificationRules({ [rule.id]: !notificationRules[rule.id as keyof typeof notificationRules] })}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                  notificationRules[rule.id as keyof typeof notificationRules] ? "bg-indigo-600" : "bg-gray-200"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    notificationRules[rule.id as keyof typeof notificationRules] ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <TaskTypeManager />
    </div>
  );
};
