import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, Task, TaskType, TeamMember, NotificationRules, TaskStatus } from '../types';
import { addDays, format, isAfter, isBefore, startOfDay } from 'date-fns';

interface StoreContextType extends AppState {
  addTask: (task: Omit<Task, 'id' | 'due_date' | 'status' | 'notifications_sent'>) => Task;
  updateTask: (id: number, updates: Partial<Task>) => void;
  deleteTask: (id: number) => void;
  addTaskType: (type: TaskType) => void;
  updateTaskType: (name: string, updates: Partial<TaskType>) => void;
  deleteTaskType: (name: string) => void;
  addTeamMember: (member: TeamMember) => void;
  updateTeamMember: (email: string, updates: Partial<TeamMember>) => void;
  deleteTeamMember: (email: string) => void;
  updateNotificationRules: (rules: Partial<NotificationRules>) => void;
  getOverdueTasks: () => Task[];
  getTasksDueSoon: (days?: number) => Task[];
}

const DEFAULT_TASK_TYPES: TaskType[] = [
  { name: "LinkedIn post", sla_days: 2, default_owner: "Raneem", default_stakeholders: ["Islam"], reminder_days_before: 1 },
  { name: "Email campaign", sla_days: 4, default_owner: "Raneem", default_stakeholders: ["Islam", "Marwa"], reminder_days_before: 1 },
  { name: "Event comms", sla_days: 5, default_owner: "Raneem", default_stakeholders: ["Islam"], reminder_days_before: 2 },
  { name: "Design asset", sla_days: 3, default_owner: "Raneem", default_stakeholders: ["Islam"], reminder_days_before: 1 },
  { name: "Blog article", sla_days: 7, default_owner: "Marwa", default_stakeholders: ["Islam"], reminder_days_before: 2 },
  { name: "Social media scheduling", sla_days: 3, default_owner: "Sara", default_stakeholders: ["Raneem"], reminder_days_before: 1 },
  { name: "Campaign launch", sla_days: 10, default_owner: "Islam", default_stakeholders: ["All team"], reminder_days_before: 3 },
  { name: "WhatsApp broadcast", sla_days: 2, default_owner: "Raneem", default_stakeholders: ["Islam"], reminder_days_before: 1 },
  { name: "Ebook / long-form content", sla_days: 14, default_owner: "Marwa", default_stakeholders: ["Islam", "Raneem"], reminder_days_before: 3 },
  { name: "Brand / visual identity", sla_days: 7, default_owner: "Raneem", default_stakeholders: ["Islam"], reminder_days_before: 2 },
];

const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  { name: "Raneem", role: "Marketing & Brand Lead", email: "raneem@example.com", google_chat_id: "raneem_chat", is_admin: false },
  { name: "Marwa", role: "Email & Comms", email: "marwa@example.com", google_chat_id: "marwa_chat", is_admin: false },
  { name: "Islam", role: "Founder & Strategy", email: "islam@example.com", google_chat_id: "islam_chat", is_admin: true },
  { name: "Sara", role: "Social Media", email: "sara@example.com", google_chat_id: "sara_chat", is_admin: false },
];

const DUMMY_TASKS: Task[] = [
  {
    id: 1,
    name: "Q2 Strategy LinkedIn Post",
    type: "LinkedIn post",
    owner: "Raneem",
    stakeholders: ["Islam"],
    created_date: "2026-04-01",
    start_date: "2026-04-01",
    due_date: "2026-04-03",
    status: "In progress",
    notifications_sent: ["new_task_gchat"]
  },
  {
    id: 2,
    name: "Monthly Newsletter - March",
    type: "Email campaign",
    owner: "Raneem",
    stakeholders: ["Islam", "Marwa"],
    created_date: "2026-03-28",
    start_date: "2026-03-28",
    due_date: "2026-04-01",
    status: "Overdue",
    notifications_sent: ["new_task_gchat", "sla_reminder_gchat"]
  },
  {
    id: 3,
    name: "Consulting Trends 2026 Blog",
    type: "Blog article",
    owner: "Marwa",
    stakeholders: ["Islam"],
    created_date: "2026-04-02",
    start_date: "2026-04-02",
    due_date: "2026-04-09",
    status: "Not started",
    notifications_sent: []
  },
  {
    id: 4,
    name: "New Service Line Launch",
    type: "Campaign launch",
    owner: "Islam",
    stakeholders: ["All team"],
    created_date: "2026-03-31",
    start_date: "2026-03-31",
    due_date: "2026-04-10",
    status: "In progress",
    notifications_sent: ["new_task_gchat"]
  },
  {
    id: 5,
    name: "Emergency Client Update",
    type: "WhatsApp broadcast",
    owner: "Raneem",
    stakeholders: ["Islam"],
    created_date: "2026-03-30",
    start_date: "2026-03-30",
    due_date: "2026-04-01",
    status: "Done",
    notifications_sent: ["new_task_gchat", "sla_reminder_gchat"]
  },
  {
    id: 6,
    name: "Conference Banner Design",
    type: "Design asset",
    owner: "Raneem",
    stakeholders: ["Islam"],
    created_date: "2026-04-02",
    start_date: "2026-04-02",
    due_date: "2026-04-05",
    publishing_date: "2026-04-03",
    status: "Not started",
    notifications_sent: []
  }
];

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('marketing_ops_state');
    if (saved) return JSON.parse(saved);
    return {
      taskTypes: DEFAULT_TASK_TYPES,
      teamMembers: DEFAULT_TEAM_MEMBERS,
      tasks: DUMMY_TASKS,
      notificationRules: {
        new_task_gchat: true,
        new_task_email: true,
        morning_briefing_gchat: true,
        sla_reminder_gchat: true,
        overdue_reminder_gchat: true,
        overdue_email_escalation: true,
        weekly_digest_email: false,
      }
    };
  });

  useEffect(() => {
    localStorage.setItem('marketing_ops_state', JSON.stringify(state));
  }, [state]);

  const addTask = (taskData: Omit<Task, 'id' | 'due_date' | 'status' | 'notifications_sent'>) => {
    const taskType = state.taskTypes.find(t => t.name === taskData.type);
    const slaDays = taskType?.sla_days || 0;
    const dueDate = format(addDays(new Date(taskData.start_date), slaDays), 'yyyy-MM-dd');
    
    const newTask: Task = {
      ...taskData,
      id: Date.now(),
      due_date: dueDate,
      status: "Not started",
      notifications_sent: []
    };

    setState(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask]
    }));

    return newTask;
  };

  const updateTask = (id: number, updates: Partial<Task>) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
    }));
  };

  const deleteTask = (id: number) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id)
    }));
  };

  const addTaskType = (type: TaskType) => {
    setState(prev => ({ ...prev, taskTypes: [...prev.taskTypes, type] }));
  };

  const updateTaskType = (name: string, updates: Partial<TaskType>) => {
    setState(prev => ({
      ...prev,
      taskTypes: prev.taskTypes.map(t => t.name === name ? { ...t, ...updates } : t)
    }));
  };

  const deleteTaskType = (name: string) => {
    setState(prev => ({
      ...prev,
      taskTypes: prev.taskTypes.filter(t => t.name !== name)
    }));
  };

  const addTeamMember = (member: TeamMember) => {
    setState(prev => ({ ...prev, teamMembers: [...prev.teamMembers, member] }));
  };

  const updateTeamMember = (email: string, updates: Partial<TeamMember>) => {
    setState(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.map(m => m.email === email ? { ...m, ...updates } : m)
    }));
  };

  const deleteTeamMember = (email: string) => {
    setState(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.filter(m => m.email !== email)
    }));
  };

  const updateNotificationRules = (rules: Partial<NotificationRules>) => {
    setState(prev => ({ ...prev, notificationRules: { ...prev.notificationRules, ...rules } }));
  };

  const getOverdueTasks = () => {
    const today = startOfDay(new Date());
    return state.tasks.filter(t => 
      t.status !== "Done" && isBefore(new Date(t.due_date), today)
    );
  };

  const getTasksDueSoon = (days: number = 2) => {
    const today = startOfDay(new Date());
    const soon = addDays(today, days);
    return state.tasks.filter(t => 
      t.status !== "Done" && 
      !isBefore(new Date(t.due_date), today) && 
      !isAfter(new Date(t.due_date), soon)
    );
  };

  return (
    <StoreContext.Provider value={{ 
      ...state, 
      addTask, 
      updateTask, 
      deleteTask, 
      addTaskType,
      updateTaskType,
      deleteTaskType,
      addTeamMember,
      updateTeamMember,
      deleteTeamMember,
      updateNotificationRules,
      getOverdueTasks,
      getTasksDueSoon
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};
