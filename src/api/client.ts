import type {
  CrmConnector,
  CrmSyncRecord,
  LeadThread,
  ResponseTemplate,
  SentimentAnalysis,
  WorkspaceState,
  LeadPriorityTier,
} from '../types/agent';

export interface WorkspaceBootstrapResponse {
  workspace: WorkspaceState;
  serverCapabilities: {
    geminiConfigured: boolean;
    crmEnvWebhookConfigured: boolean;
    instagramWebhookPath: string;
  };
}

export async function fetchWorkspace(): Promise<WorkspaceBootstrapResponse> {
  const res = await fetch('/api/workspace');
  if (!res.ok) {
    throw new Error('Failed to load workspace state.');
  }
  return res.json() as Promise<WorkspaceBootstrapResponse>;
}

export async function persistWorkspace(workspace: WorkspaceState): Promise<void> {
  const res = await fetch('/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspace),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to persist workspace state.');
  }
}

export async function resetWorkspaceOnServer(): Promise<WorkspaceState> {
  const res = await fetch('/api/workspace/reset', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Failed to reset workspace.');
  }
  const data = (await res.json()) as { workspace: WorkspaceState };
  return data.workspace;
}

export interface AnalyzeDmClientPayload {
  handle: string;
  displayName: string;
  company?: string;
  followers: number;
  isVerified: boolean;
  messageText: string;
  conversationHistory?: Array<{ sender: string; text: string }>;
  templates: ResponseTemplate[];
  brandVoiceNotes: string;
  defaultCalendarLink: string;
  highPriorityThreshold: number;
  vipFollowerThreshold: number;
}

export interface AnalyzeDmClientResult {
  analysis: SentimentAnalysis;
  priorityScore: number;
  priorityTier: LeadPriorityTier;
}

export async function analyzeDmRequest(
  payload: AnalyzeDmClientPayload
): Promise<AnalyzeDmClientResult> {
  const res = await fetch('/api/agent/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as AnalyzeDmClientResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'AI sentiment analysis failed.');
  }
  return data;
}

export async function syncThreadToCrmRequest(
  thread: LeadThread,
  connector: CrmConnector
): Promise<{ syncRecord: CrmSyncRecord; error?: string }> {
  const res = await fetch('/api/crm/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread, connector }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    syncRecord?: CrmSyncRecord;
    error?: string;
  };
  if (!res.ok) {
    if (data.syncRecord) {
      return { syncRecord: data.syncRecord, error: data.error || 'CRM delivery failed.' };
    }
    throw new Error(data.error || 'CRM synchronization failed.');
  }
  if (!data.syncRecord) {
    throw new Error('CRM sync returned an unexpected response.');
  }
  return { syncRecord: data.syncRecord };
}
