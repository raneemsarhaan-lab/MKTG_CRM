export type TaskStatus = "Not started" | "In progress" | "Overdue" | "Done";

export interface TaskType {
  name: string;
  sla_days: number;
  default_owner: string;
  default_stakeholders: string[];
  reminder_days_before: number;
  description?: string;
}

export interface TeamMember {
  name: string;
  role: string;
  email: string;
  google_chat_id: string;
  is_admin: boolean;
}

export interface Task {
  id: number;
  name: string;
  type: string;
  owner: string;
  stakeholders: string[];
  created_date: string;
  start_date: string;
  due_date: string;
  publishing_date?: string;
  status: TaskStatus;
  notes?: string;
  notifications_sent: string[];
}

export interface NotificationRules {
  new_task_gchat: boolean;
  new_task_email: boolean;
  morning_briefing_gchat: boolean;
  sla_reminder_gchat: boolean;
  overdue_reminder_gchat: boolean;
  overdue_email_escalation: boolean;
  weekly_digest_email: boolean;
}

export interface AppState {
  taskTypes: TaskType[];
  teamMembers: TeamMember[];
  tasks: Task[];
  notificationRules: NotificationRules;
}
