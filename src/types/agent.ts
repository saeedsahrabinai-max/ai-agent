export type SentimentType = 'positive' | 'neutral' | 'negative' | 'urgent';

export type LeadPriorityTier = 'critical' | 'high' | 'medium' | 'low';

export type IntentType =
  | 'wholesale_inquiry'
  | 'purchase_intent'
  | 'brand_partnership'
  | 'support_escalation'
  | 'pricing_question'
  | 'general_engagement';

export type ThreadStatus = 'needs_review' | 'auto_replied' | 'replied' | 'escalated';

export type CrmProviderId = 'hubspot' | 'salesforce' | 'pipedrive' | 'custom_webhook';

export interface DmMessage {
  id: string;
  sender: 'lead' | 'agent' | 'human';
  text: string;
  timestamp: string;
  templateUsedId?: string;
  templateUsedName?: string;
  autoSent?: boolean;
}

export interface SentimentAnalysis {
  sentiment: SentimentType;
  polarityScore: number; // -1.0 to 1.0
  confidence: number; // 0 to 1
  toneSummary: string;
  intent: IntentType;
  detectedSignals: string[];
  estimatedDealValue?: number;
  recommendedTemplateId: string | null;
  suggestedReply: string;
  analyzedAt: string;
  modelUsed: string;
}

export interface LeadThread {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  followers: number;
  isVerified: boolean;
  company?: string;
  location?: string;
  bio?: string;
  unread: boolean;
  status: ThreadStatus;
  priorityScore: number; // 0 to 100
  priorityTier: LeadPriorityTier;
  analysis: SentimentAnalysis;
  messages: DmMessage[];
  lastActivityAt: string;
  crmSynced: boolean;
  crmExternalId?: string;
  crmSyncedAt?: string;
  crmProvider?: CrmProviderId;
}

export interface ResponseTemplate {
  id: string;
  name: string;
  intent: IntentType;
  sentiments: SentimentType[];
  minPriorityTier: LeadPriorityTier;
  autoSendEligible: boolean;
  active: boolean;
  body: string;
  usageCount: number;
  updatedAt: string;
}

export interface CrmFieldMapping {
  sourceField: string;
  targetField: string;
  enabled: boolean;
}

export interface CrmConnector {
  id: CrmProviderId;
  name: string;
  subtitle: string;
  connected: boolean;
  autoSyncEnabled: boolean;
  minPriorityScore: number;
  webhookUrl: string;
  objectType: string;
  lastSyncedAt?: string;
  totalSynced: number;
  fieldMappings: CrmFieldMapping[];
}

export interface CrmSyncRecord {
  id: string;
  threadId: string;
  leadHandle: string;
  leadName: string;
  providerId: CrmProviderId;
  providerName: string;
  priorityScore: number;
  sentiment: SentimentType;
  status: 'delivered' | 'sandbox_delivered' | 'failed';
  httpStatus: number;
  externalRecordId: string;
  timestamp: string;
  payloadPreview: Record<string, unknown>;
  errorMessage?: string;
}

export interface AutomationSettings {
  autoReplyEnabled: boolean;
  holdNegativeForReview: boolean;
  highPriorityThreshold: number;
  vipFollowerThreshold: number;
  defaultCalendarLink: string;
  brandVoiceNotes: string;
}

export interface WorkspaceState {
  threads: LeadThread[];
  templates: ResponseTemplate[];
  connectors: CrmConnector[];
  syncLogs: CrmSyncRecord[];
  settings: AutomationSettings;
}

export type InboxFilter =
  | 'all'
  | 'high_priority'
  | 'urgent_negative'
  | 'needs_review'
  | 'crm_synced';

export type InboxSort = 'priority' | 'recent';

export type ActiveNavSection = 'inbox' | 'templates' | 'crm' | 'automation';
