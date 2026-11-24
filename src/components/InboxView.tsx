import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Loader2,
  RefreshCw,
  Search,
  Send,
  UploadCloud,
} from 'lucide-react';
import type {
  AutomationSettings,
  CrmConnector,
  InboxFilter,
  InboxSort,
  LeadThread,
  ResponseTemplate,
  SentimentType,
} from '../types/agent';
import {
  filterAndSortThreads,
  formatFollowerCount,
  formatIntentLabel,
  formatPriorityLabel,
  formatRelativeTime,
  formatSentimentLabel,
  interpolateTemplate,
} from '../utils/agentLogic';
import { LeadAvatar } from './LeadAvatar';

interface InboxViewProps {
  threads: LeadThread[];
  templates: ResponseTemplate[];
  settings: AutomationSettings;
  activeConnector: CrmConnector | null;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onSendReply: (threadId: string, text: string, templateId?: string) => void;
  onReanalyzeThread: (threadId: string) => Promise<void>;
  onSyncThreadToCrm: (threadId: string) => Promise<void>;
  onOpenSimulateModal: () => void;
  analyzingThreadId: string | null;
  syncingThreadId: string | null;
  actionError: string | null;
  onClearActionError: () => void;
}

const FILTER_TABS: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'high_priority', label: 'Priority' },
  { id: 'urgent_negative', label: 'Urgent' },
  { id: 'needs_review', label: 'Review' },
  { id: 'crm_synced', label: 'CRM' },
];

function sentimentTextClass(sentiment: SentimentType): string {
  switch (sentiment) {
    case 'positive':
      return 'text-emerald-700';
    case 'urgent':
    case 'negative':
      return 'text-red-700';
    case 'neutral':
    default:
      return 'text-slate-600';
  }
}

function priorityScoreClass(score: number, highThreshold: number): string {
  if (score >= Math.min(95, highThreshold + 15)) return 'text-red-700';
  if (score >= highThreshold) return 'text-amber-700';
  return 'text-slate-700';
}

export function InboxView({
  threads,
  templates,
  settings,
  activeConnector,
  selectedThreadId,
  onSelectThread,
  onSendReply,
  onReanalyzeThread,
  onSyncThreadToCrm,
  onOpenSimulateModal,
  analyzingThreadId,
  syncingThreadId,
  actionError,
  onClearActionError,
}: InboxViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [sortBy, setSortBy] = useState<InboxSort>('priority');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const visibleThreads = filterAndSortThreads(threads, {
    searchQuery,
    filter,
    sortBy,
    highPriorityThreshold: settings.highPriorityThreshold,
  });

  const selectedThread =
    visibleThreads.find((t) => t.id === selectedThreadId) ??
    threads.find((t) => t.id === selectedThreadId) ??
    visibleThreads[0] ??
    null;

  const [draftText, setDraftText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedThread) {
      setDraftText('');
      setSelectedTemplateId('');
      return;
    }
    setDraftText(selectedThread.analysis.suggestedReply);
    setSelectedTemplateId(selectedThread.analysis.recommendedTemplateId ?? '');
    setDraftError(null);
  }, [selectedThread?.id, selectedThread?.analysis.analyzedAt]);

  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!selectedThread || !templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const topicHint =
      selectedThread.analysis.detectedSignals[0] || formatIntentLabel(selectedThread.analysis.intent);
    const interpolated = interpolateTemplate(tpl.body, {
      name: selectedThread.displayName,
      handle: selectedThread.handle,
      company: selectedThread.company,
      topic: topicHint,
      calendar_link: settings.defaultCalendarLink,
    });
    setDraftText(interpolated);
    setDraftError(null);
  };

  const handleSend = () => {
    if (!selectedThread) return;
    const clean = draftText.trim();
    if (!clean) {
      setDraftError('Write or select a template response before sending.');
      return;
    }
    setDraftError(null);
    onSendReply(selectedThread.id, clean, selectedTemplateId || undefined);
    setDraftText('');
  };

  const handleSelectListItem = (id: string) => {
    onSelectThread(id);
    setMobileShowDetail(true);
    onClearActionError();
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-white">
      {/* Left Queue Pane */}
      <section
        aria-label="Instagram DM priority queue"
        className={`${
          mobileShowDetail ? 'hidden md:flex' : 'flex'
        } w-full md:w-[360px] xl:w-[390px] shrink-0 flex-col border-r border-slate-200 bg-white min-h-0`}
      >
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search Instagram DMs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads, handles, or signals..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              aria-label="Sort leads"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as InboxSort)}
              className="px-2.5 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
            >
              <option value="priority">Priority</option>
              <option value="recent">Recent</option>
            </select>
          </div>

          <div
            role="tablist"
            aria-label="Filter direct messages"
            className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100" data-testid="dm-thread-list">
          {visibleThreads.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900">No matching conversations</p>
              <p className="text-xs text-slate-500">
                Try clearing your filter or simulate a new incoming Instagram DM.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {filter !== 'all' || searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('all');
                      setSearchQuery('');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                  >
                    Clear filters
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenSimulateModal}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg whitespace-nowrap"
                >
                  Simulate DM
                </button>
              </div>
            </div>
          ) : (
            visibleThreads.map((thread) => {
              const isSelected = selectedThread?.id === thread.id;
              const latestMsg = thread.messages[thread.messages.length - 1];
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleSelectListItem(thread.id)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`w-full text-left px-4 py-3.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                    isSelected ? 'bg-indigo-50/70' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <LeadAvatar name={thread.displayName} avatarUrl={thread.avatarUrl} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {thread.displayName}
                        </span>
                        <span
                          className={`font-mono text-xs font-semibold tabular-nums shrink-0 ${priorityScoreClass(
                            thread.priorityScore,
                            settings.highPriorityThreshold
                          )}`}
                        >
                          {thread.priorityScore}/100
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                        <span className="truncate">{thread.handle}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-medium ${sentimentTextClass(thread.analysis.sentiment)}`}>
                          {formatSentimentLabel(thread.analysis.sentiment)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums shrink-0">
                          {formatRelativeTime(thread.lastActivityAt)}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {latestMsg?.sender !== 'lead' ? 'You: ' : ''}
                        {latestMsg?.text}
                      </p>

                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="truncate">{formatIntentLabel(thread.analysis.intent)}</span>
                        {thread.crmSynced && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-medium shrink-0">CRM synced</span>
                          </>
                        )}
                        {thread.status === 'auto_replied' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-indigo-700 font-medium shrink-0">Auto-replied</span>
                          </>
                        )}
                        {thread.status === 'escalated' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-red-700 font-medium shrink-0">Escalated</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Right Thread Detail & AI Workbench */}
      <section
        aria-label="Conversation detail and AI sentiment workbench"
        className={`${
          mobileShowDetail ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col min-w-0 min-h-0 bg-slate-50/50`}
      >
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">Select a direct message</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              Choose a lead from the priority queue to inspect AI sentiment analysis, adjust
              templated replies, or sync to your CRM.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowDetail(false)}
                  aria-label="Back to DM queue"
                  className="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <LeadAvatar
                  name={selectedThread.displayName}
                  avatarUrl={selectedThread.avatarUrl}
                  size="md"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-base font-semibold text-slate-900 truncate">
                      {selectedThread.displayName}
                    </h1>
                    {selectedThread.isVerified && (
                      <BadgeCheck
                        className="h-4 w-4 text-indigo-600 shrink-0"
                        aria-label="Verified Instagram account"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                    <span className="shrink-0">{selectedThread.handle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {formatFollowerCount(selectedThread.followers)} followers
                    </span>
                    {selectedThread.company && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{selectedThread.company}</span>
                      </>
                    )}
                    {selectedThread.location && (
                      <>
                        <span aria-hidden="true" className="hidden xl:inline">·</span>
                        <span className="hidden xl:inline shrink-0">{selectedThread.location}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onReanalyzeThread(selectedThread.id)}
                  disabled={analyzingThreadId === selectedThread.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {analyzingThreadId === selectedThread.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Re-analyze AI
                </button>

                <button
                  type="button"
                  onClick={() => onSyncThreadToCrm(selectedThread.id)}
                  disabled={syncingThreadId === selectedThread.id || !activeConnector}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                    selectedThread.crmSynced
                      ? 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                      : 'text-white bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {syncingThreadId === selectedThread.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : selectedThread.crmSynced ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <UploadCloud className="h-3.5 w-3.5" />
                  )}
                  {selectedThread.crmSynced
                    ? `Synced (${activeConnector?.name.split(' ')[0] ?? 'CRM'})`
                    : activeConnector
                      ? `Sync to ${activeConnector.name.split(' ')[0]}`
                      : 'No CRM connected'}
                </button>
              </div>
            </div>

            {actionError && (
              <div
                role="alert"
                className="mx-6 mt-4 px-4 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3"
              >
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={onClearActionError}
                  className="text-red-800 font-medium hover:underline whitespace-nowrap shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* AI Sentiment & Lead Triage Strip */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Lead priority</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span
                      className={`font-mono text-lg font-semibold tabular-nums ${priorityScoreClass(
                        selectedThread.priorityScore,
                        settings.highPriorityThreshold
                      )}`}
                    >
                      {selectedThread.priorityScore}/100
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      {formatPriorityLabel(selectedThread.priorityTier)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">AI sentiment</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span
                      className={`text-sm font-semibold ${sentimentTextClass(
                        selectedThread.analysis.sentiment
                      )}`}
                    >
                      {formatSentimentLabel(selectedThread.analysis.sentiment)}
                    </span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {selectedThread.analysis.polarityScore > 0 ? '+' : ''}
                      {selectedThread.analysis.polarityScore.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Detected intent</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">
                    {formatIntentLabel(selectedThread.analysis.intent)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Est. deal value</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {selectedThread.analysis.estimatedDealValue
                      ? `$${selectedThread.analysis.estimatedDealValue.toLocaleString()}`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 text-xs">
                <p className="text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900">Tone analysis: </span>
                  {selectedThread.analysis.toneSummary}
                </p>
                {selectedThread.crmExternalId && (
                  <span className="font-mono text-slate-500 shrink-0 tabular-nums">
                    CRM ID: {selectedThread.crmExternalId}
                  </span>
                )}
              </div>

              {selectedThread.analysis.detectedSignals.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Signals:</span>
                  {selectedThread.analysis.detectedSignals.map((signal, idx) => (
                    <span key={`${signal}-${idx}`} className="inline-flex items-center gap-2">
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>{signal}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Conversation History */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {selectedThread.messages.map((msg) => {
                const isLead = msg.sender === 'lead';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isLead ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-2xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
                        isLead
                          ? 'bg-white border border-slate-200 text-slate-900'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 px-1">
                      <span>
                        {isLead
                          ? selectedThread.handle
                          : msg.autoSent
                            ? 'Threadline Auto-Reply'
                            : 'Sent by agent'}
                      </span>
                      {msg.templateUsedName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Template: {msg.templateUsedName}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatRelativeTime(msg.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Templated Response Composer */}
            <div className="bg-white border-t border-slate-200 px-6 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <label
                    htmlFor="composer-template-select"
                    className="text-xs font-medium text-slate-700 whitespace-nowrap"
                  >
                    Response template
                  </label>
                  <select
                    id="composer-template-select"
                    value={selectedTemplateId}
                    onChange={(e) => handleApplyTemplate(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[260px]"
                  >
                    <option value="">Custom reply</option>
                    {templates
                      .filter((t) => t.active)
                      .map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                  </select>
                </div>

                <span className="text-xs text-slate-500">
                  {selectedThread.status === 'escalated'
                    ? 'Held for human review by negative-sentiment guardrail'
                    : selectedThread.status === 'auto_replied'
                      ? 'Initial reply sent automatically'
                      : 'Ready for review or one-click send'}
                </span>
              </div>

              <div>
                <label htmlFor="dm-reply-composer" className="sr-only">
                  Direct message reply draft
                </label>
                <textarea
                  id="dm-reply-composer"
                  rows={4}
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value);
                    if (draftError) setDraftError(null);
                  }}
                  placeholder={`Reply to ${selectedThread.handle}...`}
                  className="w-full px-3.5 py-2.5 text-sm leading-relaxed border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                {draftError && (
                  <p role="alert" className="mt-1 text-xs text-red-700">
                    {draftError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraftText(selectedThread.analysis.suggestedReply);
                    setSelectedTemplateId(selectedThread.analysis.recommendedTemplateId ?? '');
                    setDraftError(null);
                  }}
                  className="text-xs font-medium text-indigo-700 hover:text-indigo-800 hover:underline whitespace-nowrap"
                >
                  Restore AI suggestion
                </button>

                <button
                  type="button"
                  onClick={handleSend}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send DM Reply
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
