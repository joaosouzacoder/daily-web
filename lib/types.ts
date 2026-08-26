// Uma conta era 'work' ou 'personal' — dois valores fixos, os do dono da
// máquina. Agora é o id de uma conexão cadastrada, então o tipo é o rótulo que
// acompanha o dado, não uma enumeração no código.
export type Account = string;

export interface EmailEnvelope {
  id: string;
  account: Account;
  accountLabel: string;
  from: string;
  subject: string;
  unread: boolean;
  date: string;
  messageId: string;
}

export interface AgendaItem {
  account: Account;
  accountLabel: string;
  date: string;
  time: string;
  title: string;
}

export interface PullRequestItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  draft: boolean;
  /** Pediram a sua revisão. */
  awaitingYou: boolean;
  /** Você abriu este PR. */
  mine: boolean;
  updatedAt: string;
}

export interface PullsDigest {
  items: PullRequestItem[];
  /** Repositórios que falharam sozinhos, sem derrubar os outros. */
  errors: string[];
}

export type JiraRole = 'assignee' | 'reporter' | 'both';

export interface JiraParent {
  key: string;
  summary: string;
}

/** As três situações do Jira, normalizadas. O nome do status é livre e varia
 *  por projeto e por idioma; a categoria não. */
export type JiraStatusCategory = 'new' | 'indeterminate' | 'done';

export interface JiraItem {
  key: string;
  summary: string;
  status: string;
  statusCategory: JiraStatusCategory;
  project: string;
  url: string;
  parent: JiraParent | null;
  role: JiraRole;
  kind: string;
  subtask: boolean;
  /** ISO da última alteração. É daqui que sai "parado há X dias". */
  updatedAt: string;
  /** AAAA-MM-DD, ou vazio quando a issue não tem prazo. */
  dueDate: string;
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

export interface MailboxRef {
  id: string;
  label: string;
}

export interface DashboardState {
  updatedAt: string;
  /** Módulos que este usuário ligou. O painel só desenha o que está aqui. */
  modules: string[];
  /** Caixas de e-mail do usuário, para os filtros e o envio de resposta. */
  mailboxes: MailboxRef[];
  /** Quantos dias a agenda cobre, contando hoje. Escolha de cada usuário. */
  agendaDays: number;
  /** Disposição dos painéis na grade, arrastada e redimensionada pelo dono. */
  layout: { i: string; x: number; y: number; w: number; h: number }[];
  email: PanelResult<EmailEnvelope[]>;
  agenda: PanelResult<AgendaItem[]>;
  pulls: PanelResult<PullsDigest>;
  jira: PanelResult<JiraItem[]>;
  tasks: PanelResult<TodoTask[]>;
  notifications: PanelResult<NotificationItem[]>;
  pomodoro: PomodoroState;
}
