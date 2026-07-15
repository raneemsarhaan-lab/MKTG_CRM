export type StageId =
  | 'todo'
  | 'c-prog'
  | 'c-final'
  | 'c-check'
  | 'r-design'
  | 'd-prog'
  | 'd-check'
  | 'final-check'
  | 'publish'

export type ContentType = 'Post' | 'Video' | 'Reel' | 'Design' | 'Email' | 'Story' | 'Deck' | 'Other'
export type Brand = 'Islam Personal Branding' | 'The Strategy Community' | 'Omnisight' | 'Forefront'
export type Priority = 'High' | 'Medium' | 'Low'
export type AccessLevel = 'admin' | 'superuser' | 'user'
export type Phase = 'content' | 'design'
export type Platform = 'LinkedIn' | 'Instagram' | 'TikTok' | 'Facebook'

export interface TaskComment {
  who: string
  text: string
  when: string
}

export interface Task {
  id: number
  name: string
  account: Brand
  initiator: string   // role name of creator
  assignee: string    // member name of executor
  priority: Priority
  due: string         // YYYY-MM-DD
  hours: number
  status: StageId
  ctype: ContentType
  stageDate: string   // date task entered current stage, YYYY-MM-DD
  platform?: Platform
  campaign?: string
  comments?: TaskComment[]
  attachments?: string[]
}

export interface Member {
  name: string
  role: string
  access: AccessLevel
  color: string       // hex foreground / accent color
  bg: string          // hex avatar background
  tc: string          // tailwind text color class for badges
  email?: string
  capacity?: number
  status?: 'Available' | 'Busy'
  nickname?: string
}

export interface Stage {
  id: StageId
  label: string
  phase: Phase
  reviewer: string
  skip8: boolean      // skip in 8-stage flow (non-content-creator initiator)
}

export interface SLAConfig {
  [stageId: string]: number  // max days in stage before flagging
}
