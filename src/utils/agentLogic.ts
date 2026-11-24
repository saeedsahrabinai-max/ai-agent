import type {
  InboxFilter,
  InboxSort,
  IntentType,
  LeadPriorityTier,
  LeadThread,
  ResponseTemplate,
  SentimentType,
  CrmSyncRecord,
} from '../types/agent';

export interface PriorityScoreInput {
  intent: IntentType;
  sentiment: SentimentType;
  followers: number;
  isVerified: boolean;
  detectedSignals: string[];
  estimatedDealValue?: number;
  vipFollowerThreshold?: number;
}

const INTENT_WEIGHTS: Record<IntentType, number> = {
  wholesale_inquiry: 44,
  purchase_intent: 38,
  support_escalation: 34,
  brand_partnership: 30,
  pricing_question: 26,
  general_engagement: 10,
};

const SENTIMENT_WEIGHTS: Record<SentimentType, number> = {
  urgent: 24,
  negative: 18,
  positive: 14,
  neutral: 6,
};

const TIER_RANK: Record<LeadPriorityTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function computeLeadPriorityScore(input: PriorityScoreInput): number {
  const vipThreshold = input.vipFollowerThreshold ?? 25000;
  let score = 0;

  score += INTENT_WEIGHTS[input.intent] ?? 10;
  score += SENTIMENT_WEIGHTS[input.sentiment] ?? 6;

  // Follower reach & VIP boost
  if (input.followers >= vipThreshold * 4) {
    score += 18;
  } else if (input.followers >= vipThreshold) {
    score += 13;
  } else if (input.followers >= 5000) {
    score += 7;
  } else if (input.followers >= 1000) {
    score += 3;
  }

  if (input.isVerified) {
    score += 6;
  }

  // Signals & estimated deal value
  const signalBoost = Math.min(input.detectedSignals.length * 3, 12);
  score += signalBoost;

  if (typeof input.estimatedDealValue === 'number' && input.estimatedDealValue >= 5000) {
    score += 12;
  } else if (typeof input.estimatedDealValue === 'number' && input.estimatedDealValue >= 1500) {
    score += 7;
  } else if (typeof input.estimatedDealValue === 'number' && input.estimatedDealValue > 0) {
    score += 3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classifyPriorityTier(
  score: number,
  highPriorityThreshold = 70
): LeadPriorityTier {
  const clampedHigh = Math.max(40, Math.min(90, highPriorityThreshold));
  const criticalThreshold = Math.min(95, clampedHigh + 15);

  if (score >= criticalThreshold) return 'critical';
  if (score >= clampedHigh) return 'high';
  if (score >= Math.max(30, clampedHigh - 25)) return 'medium';
  return 'low';
}

export interface TemplateVariables {
  name?: string;
  handle?: string;
  topic?: string;
  company?: string;
  calendar_link?: string;
}

export function interpolateTemplate(body: string, vars: TemplateVariables): string {
  const firstName = vars.name?.trim().split(/\s+/)[0] || 'there';
  const cleanHandle = vars.handle
    ? vars.handle.startsWith('@')
      ? vars.handle
      : `@${vars.handle}`
    : '@friend';

  const lookup: Record<string, string> = {
    name: firstName,
    handle: cleanHandle,
    topic: vars.topic?.trim() || 'your inquiry',
    company: vars.company?.trim() || 'your team',
    calendar_link: vars.calendar_link?.trim() || 'https://cal.threadline.app/priority-intro',
  };

  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return lookup[key] ?? '';
  });
}

export function matchBestTemplate(
  templates: ResponseTemplate[],
  intent: IntentType,
  sentiment: SentimentType,
  priorityTier: LeadPriorityTier
): ResponseTemplate | null {
  const activeTemplates = templates.filter((t) => t.active);
  if (activeTemplates.length === 0) return null;

  let best: ResponseTemplate | null = null;
  let bestScore = -1;

  for (const template of activeTemplates) {
    let score = 0;
    if (template.intent === intent) {
      score += 50;
    }
    if (template.sentiments.includes(sentiment)) {
      score += 30;
    }
    if (TIER_RANK[priorityTier] >= TIER_RANK[template.minPriorityTier]) {
      score += 15;
    } else {
      score -= 10;
    }
    if (template.autoSendEligible) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = template;
    }
  }

  return best;
}

export function filterAndSortThreads(
  threads: LeadThread[],
  options: {
    searchQuery: string;
    filter: InboxFilter;
    sortBy: InboxSort;
    highPriorityThreshold: number;
  }
): LeadThread[] {
  const query = options.searchQuery.trim().toLowerCase();

  const filtered = threads.filter((thread) => {
    if (options.filter === 'high_priority' && thread.priorityScore < options.highPriorityThreshold) {
      return false;
    }
    if (
      options.filter === 'urgent_negative' &&
      thread.analysis.sentiment !== 'urgent' &&
      thread.analysis.sentiment !== 'negative'
    ) {
      return false;
    }
    if (options.filter === 'needs_review' && thread.status !== 'needs_review' && thread.status !== 'escalated') {
      return false;
    }
    if (options.filter === 'crm_synced' && !thread.crmSynced) {
      return false;
    }

    if (!query) return true;

    const latestText = thread.messages[thread.messages.length - 1]?.text ?? '';
    return (
      thread.displayName.toLowerCase().includes(query) ||
      thread.handle.toLowerCase().includes(query) ||
      (thread.company?.toLowerCase().includes(query) ?? false) ||
      latestText.toLowerCase().includes(query) ||
      thread.analysis.intent.replace(/_/g, ' ').includes(query) ||
      thread.analysis.detectedSignals.some((s) => s.toLowerCase().includes(query))
    );
  });

  return [...filtered].sort((a, b) => {
    if (options.sortBy === 'priority') {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    }
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });
}

export interface WorkspaceMetrics {
  totalThreads: number;
  highPriorityCount: number;
  urgentNegativeCount: number;
  autoRepliedCount: number;
  needsReviewCount: number;
  crmSyncedCount: number;
  totalEstimatedPipeline: number;
  sentimentBreakdown: Record<SentimentType, number>;
}

export function computeWorkspaceMetrics(
  threads: LeadThread[],
  _syncLogs: CrmSyncRecord[],
  highPriorityThreshold = 70
): WorkspaceMetrics {
  const sentimentBreakdown: Record<SentimentType, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    urgent: 0,
  };

  let highPriorityCount = 0;
  let urgentNegativeCount = 0;
  let autoRepliedCount = 0;
  let needsReviewCount = 0;
  let crmSyncedCount = 0;
  let totalEstimatedPipeline = 0;

  for (const thread of threads) {
    sentimentBreakdown[thread.analysis.sentiment] += 1;
    if (thread.priorityScore >= highPriorityThreshold) {
      highPriorityCount += 1;
    }
    if (thread.analysis.sentiment === 'urgent' || thread.analysis.sentiment === 'negative') {
      urgentNegativeCount += 1;
    }
    if (thread.status === 'auto_replied') {
      autoRepliedCount += 1;
    }
    if (thread.status === 'needs_review' || thread.status === 'escalated') {
      needsReviewCount += 1;
    }
    if (thread.crmSynced) {
      crmSyncedCount += 1;
    }
    if (typeof thread.analysis.estimatedDealValue === 'number') {
      totalEstimatedPipeline += thread.analysis.estimatedDealValue;
    }
  }

  return {
    totalThreads: threads.length,
    highPriorityCount,
    urgentNegativeCount,
    autoRepliedCount,
    needsReviewCount,
    crmSyncedCount,
    totalEstimatedPipeline,
    sentimentBreakdown,
  };
}

export function formatFollowerCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(count);
}

export function formatIntentLabel(intent: IntentType): string {
  const labels: Record<IntentType, string> = {
    wholesale_inquiry: 'Wholesale inquiry',
    purchase_intent: 'Purchase intent',
    brand_partnership: 'Brand partnership',
    support_escalation: 'Support escalation',
    pricing_question: 'Pricing question',
    general_engagement: 'General engagement',
  };
  return labels[intent] ?? intent;
}

export function formatSentimentLabel(sentiment: SentimentType): string {
  const labels: Record<SentimentType, string> = {
    positive: 'Positive',
    neutral: 'Neutral',
    negative: 'Negative',
    urgent: 'Urgent',
  };
  return labels[sentiment];
}

export function formatPriorityLabel(tier: LeadPriorityTier): string {
  const labels: Record<LeadPriorityTier, string> = {
    critical: 'Critical',
    high: 'High priority',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[tier];
}

export function formatRelativeTime(isoTimestamp: string, nowMs = Date.now()): string {
  const diffMs = Math.max(0, nowMs - new Date(isoTimestamp).getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
