export type Account = 'work' | 'personal';

export interface EmailEnvelope {
  id: string;
  account: Account;
  from: string;
  subject: string;
  unread: boolean;
  date: string;
}

export interface AgendaItem {
  account: Account;
  date: string;
  time: string;
  title: string;
}

export interface PullsDigest {
  lines: string[];
}

export type JiraRole = 'assignee' | 'reporter' | 'both';

export interface JiraParent {
  key: string;
  summary: string;
}

export interface JiraItem {
  key: string;
  summary: string;
  status: string;
  project: string;
  url: string;
  parent: JiraParent | null;
  role: JiraRole;
  kind: string;
  subtask: boolean;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export type TaskPriority = 'low' | 'normal' | 'high';

export interface TodoTask {
  id: string;
  title: string;
  completed: boolean;
  due: string;
  priority: TaskPriority;
  time: string;
  recur: string;
  notes: string;
  subtasks: SubTask[];
}

export type NotificationSource = 'jira_mention';

export interface NotificationItem {
  id: string;
  source: NotificationSource;
  title: string;
  url: string;
  read: boolean;
}

export type PomodoroPhase = 'focus' | 'rest';

export interface PomodoroState {
  enabled: boolean;
  phase: PomodoroPhase;
  running: boolean;
  remainingSeconds: number;
  focusMinutes: number;
  restMinutes: number;
  completedFocusCount: number;
}

export interface PanelResult<T> {
  data: T | null;
  error: string | null;
}

export interface DashboardState {
  updatedAt: string;
  email: PanelResult<EmailEnvelope[]>;
  agenda: PanelResult<AgendaItem[]>;
  pulls: PanelResult<PullsDigest>;
  jira: PanelResult<JiraItem[]>;
  tasks: PanelResult<TodoTask[]>;
  notifications: PanelResult<NotificationItem[]>;
  pomodoro: PomodoroState;
}
