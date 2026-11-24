import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, MessageSquarePlus } from 'lucide-react';
import {
  analyzeDmRequest,
  fetchWorkspace,
  persistWorkspace,
  resetWorkspaceOnServer,
  syncThreadToCrmRequest,
} from './api/client';
import { AutomationView } from './components/AutomationView';
import { CrmSyncView } from './components/CrmSyncView';
import { InboxView } from './components/InboxView';
import { Sidebar } from './components/Sidebar';
import { SimulateDmModal, type SimulatedDmInput } from './components/SimulateDmModal';
import { TemplatesView } from './components/TemplatesView';
import { INITIAL_WORKSPACE_STATE } from './data/seedData';
import type {
  ActiveNavSection,
  AutomationSettings,
  CrmConnector,
  CrmProviderId,
  LeadThread,
  ResponseTemplate,
  WorkspaceState,
} from './types/agent';
import {
  classifyPriorityTier,
  computeWorkspaceMetrics,
} from './utils/agentLogic';

const SECTION_LABELS: Record<ActiveNavSection, string> = {
  inbox: 'Priority Inbox',
  templates: 'Response Templates',
  crm: 'CRM Sync',
  automation: 'Automation Rules',
};

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(INITIAL_WORKSPACE_STATE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instagramWebhookPath, setInstagramWebhookPath] = useState('/api/webhooks/instagram');

  const [activeSection, setActiveSection] = useState<ActiveNavSection>('inbox');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    INITIAL_WORKSPACE_STATE.threads[0]?.id ?? null
  );

  const [simulateModalOpen, setSimulateModalOpen] = useState(false);
  const [simulatingDm, setSimulatingDm] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);

  const [analyzingThreadId, setAnalyzingThreadId] = useState<string | null>(null);
  const [syncingThreadId, setSyncingThreadId] = useState<string | null>(null);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);

  const workspaceRef = useRef<WorkspaceState>(workspace);
  workspaceRef.current = workspace;

  const commitWorkspace = useCallback((updater: (prev: WorkspaceState) => WorkspaceState) => {
    setWorkspace((prev) => {
      const next = updater(prev);
      workspaceRef.current = next;
      void persistWorkspace(next).catch((err) => {
        console.error('Workspace save failed:', err);
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    fetchWorkspace()
      .then((data) => {
        if (!active) return;
        setWorkspace(data.workspace);
        workspaceRef.current = data.workspace;
        setInstagramWebhookPath(data.serverCapabilities.instagramWebhookPath);
        const topThread = [...data.workspace.threads].sort(
          (a, b) => b.priorityScore - a.priorityScore
        )[0];
        setSelectedThreadId(topThread?.id ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load workspace.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(
    () =>
      computeWorkspaceMetrics(
        workspace.threads,
        workspace.syncLogs,
        workspace.settings.highPriorityThreshold
      ),
    [workspace.threads, workspace.syncLogs, workspace.settings.highPriorityThreshold]
  );

  const activeConnector = useMemo(
    () => workspace.connectors.find((c) => c.connected) ?? null,
    [workspace.connectors]
  );

  const handleSendReply = useCallback(
    (threadId: string, text: string, templateId?: string) => {
      const now = new Date().toISOString();
      commitWorkspace((prev) => {
        const tpl = templateId ? prev.templates.find((t) => t.id === templateId) : undefined;
        const nextTemplates = tpl
          ? prev.templates.map((t) =>
              t.id === tpl.id ? { ...t, usageCount: t.usageCount + 1 } : t
            )
          : prev.templates;

        const nextThreads = prev.threads.map((thread) => {
          if (thread.id !== threadId) return thread;
          return {
            ...thread,
            unread: false,
            status: 'replied' as const,
            lastActivityAt: now,
            messages: [
              ...thread.messages,
              {
                id: `msg-${Date.now()}`,
                sender: 'human' as const,
                text,
                timestamp: now,
                templateUsedId: tpl?.id,
                templateUsedName: tpl?.name,
                autoSent: false,
              },
            ],
          };
        });

        return {
          ...prev,
          templates: nextTemplates,
          threads: nextThreads,
        };
      });
    },
    [commitWorkspace]
  );

  const handleReanalyzeThread = useCallback(
    async (threadId: string) => {
      const current = workspaceRef.current;
      const thread = current.threads.find((t) => t.id === threadId);
      if (!thread) return;

      const latestLeadMessage =
        [...thread.messages].reverse().find((m) => m.sender === 'lead') ??
        thread.messages[thread.messages.length - 1];
      if (!latestLeadMessage) return;

      setAnalyzingThreadId(threadId);
      setActionError(null);
      try {
        const result = await analyzeDmRequest({
          handle: thread.handle,
          displayName: thread.displayName,
          company: thread.company,
          followers: thread.followers,
          isVerified: thread.isVerified,
          messageText: latestLeadMessage.text,
          conversationHistory: thread.messages.map((m) => ({ sender: m.sender, text: m.text })),
          templates: current.templates,
          brandVoiceNotes: current.settings.brandVoiceNotes,
          defaultCalendarLink: current.settings.defaultCalendarLink,
          highPriorityThreshold: current.settings.highPriorityThreshold,
          vipFollowerThreshold: current.settings.vipFollowerThreshold,
        });

        commitWorkspace((prev) => ({
          ...prev,
          threads: prev.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  analysis: result.analysis,
                  priorityScore: result.priorityScore,
                  priorityTier: result.priorityTier,
                }
              : t
          ),
        }));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'AI re-analysis failed.');
      } finally {
        setAnalyzingThreadId(null);
      }
    },
    [commitWorkspace]
  );

  const syncThreadWithConnector = useCallback(
    async (thread: LeadThread, connector: CrmConnector) => {
      const { syncRecord, error } = await syncThreadToCrmRequest(thread, connector);
      const syncedSuccessfully = syncRecord.status !== 'failed';

      commitWorkspace((prev) => ({
        ...prev,
        syncLogs: [syncRecord, ...prev.syncLogs].slice(0, 50),
        connectors: prev.connectors.map((c) =>
          c.id === connector.id
            ? {
                ...c,
                lastSyncedAt: syncedSuccessfully ? syncRecord.timestamp : c.lastSyncedAt,
                totalSynced: syncedSuccessfully ? c.totalSynced + 1 : c.totalSynced,
              }
            : c
        ),
        threads: prev.threads.map((t) =>
          t.id === thread.id && syncedSuccessfully
            ? {
                ...t,
                crmSynced: true,
                crmExternalId: syncRecord.externalRecordId,
                crmSyncedAt: syncRecord.timestamp,
                crmProvider: connector.id,
              }
            : t
        ),
      }));

      if (error) {
        throw new Error(error);
      }
    },
    [commitWorkspace]
  );

  const handleSyncThreadToCrm = useCallback(
    async (threadId: string) => {
      const current = workspaceRef.current;
      const thread = current.threads.find((t) => t.id === threadId);
      const connector = current.connectors.find((c) => c.connected);
      if (!thread || !connector) {
        setActionError('Connect a CRM provider in CRM Sync before pushing leads.');
        return;
      }

      setSyncingThreadId(threadId);
      setActionError(null);
      try {
        await syncThreadWithConnector(thread, connector);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'CRM sync failed.');
      } finally {
        setSyncingThreadId(null);
      }
    },
    [syncThreadWithConnector]
  );

  const handleSimulateDm = useCallback(
    async (input: SimulatedDmInput) => {
      const current = workspaceRef.current;
      setSimulatingDm(true);
      setSimulateError(null);

      try {
        const aiResult = await analyzeDmRequest({
          handle: input.handle,
          displayName: input.displayName,
          company: input.company || undefined,
          followers: input.followers,
          isVerified: input.isVerified,
          messageText: input.messageText,
          templates: current.templates,
          brandVoiceNotes: current.settings.brandVoiceNotes,
          defaultCalendarLink: current.settings.defaultCalendarLink,
          highPriorityThreshold: current.settings.highPriorityThreshold,
          vipFollowerThreshold: current.settings.vipFollowerThreshold,
        });

        const now = new Date().toISOString();
        const threadId = `thr-${Date.now()}`;
        const matchedTemplate = aiResult.analysis.recommendedTemplateId
          ? current.templates.find((t) => t.id === aiResult.analysis.recommendedTemplateId)
          : undefined;

        const isRiskySentiment =
          aiResult.analysis.sentiment === 'negative' || aiResult.analysis.sentiment === 'urgent';
        const blockedByGuardrail = current.settings.holdNegativeForReview && isRiskySentiment;
        const shouldAutoReply =
          current.settings.autoReplyEnabled &&
          !blockedByGuardrail &&
          Boolean(matchedTemplate?.autoSendEligible ?? true);

        const messages: LeadThread['messages'] = [
          {
            id: `msg-${Date.now()}-in`,
            sender: 'lead',
            text: input.messageText,
            timestamp: now,
          },
        ];

        if (shouldAutoReply) {
          messages.push({
            id: `msg-${Date.now()}-out`,
            sender: 'agent',
            text: aiResult.analysis.suggestedReply,
            timestamp: new Date(Date.now() + 1000).toISOString(),
            templateUsedId: matchedTemplate?.id,
            templateUsedName: matchedTemplate?.name,
            autoSent: true,
          });
        }

        const newThread: LeadThread = {
          id: threadId,
          handle: input.handle,
          displayName: input.displayName,
          company: input.company || undefined,
          followers: input.followers,
          isVerified: input.isVerified,
          unread: !shouldAutoReply,
          status: shouldAutoReply
            ? 'auto_replied'
            : blockedByGuardrail
              ? 'escalated'
              : 'needs_review',
          priorityScore: aiResult.priorityScore,
          priorityTier: aiResult.priorityTier,
          analysis: aiResult.analysis,
          messages,
          lastActivityAt: messages[messages.length - 1].timestamp,
          crmSynced: false,
        };

        commitWorkspace((prev) => ({
          ...prev,
          templates:
            shouldAutoReply && matchedTemplate
              ? prev.templates.map((t) =>
                  t.id === matchedTemplate.id ? { ...t, usageCount: t.usageCount + 1 } : t
                )
              : prev.templates,
          threads: [newThread, ...prev.threads],
        }));

        setSelectedThreadId(threadId);
        setActiveSection('inbox');
        setSimulateModalOpen(false);

        // Auto-sync to connected CRM if threshold met
        const autoConnector = current.connectors.find(
          (c) => c.connected && c.autoSyncEnabled && newThread.priorityScore >= c.minPriorityScore
        );
        if (autoConnector) {
          try {
            await syncThreadWithConnector(newThread, autoConnector);
          } catch (syncErr) {
            setActionError(
              syncErr instanceof Error
                ? `DM ingested, but auto-CRM sync failed: ${syncErr.message}`
                : 'DM ingested, but auto-CRM sync failed.'
            );
          }
        }
      } catch (err) {
        setSimulateError(err instanceof Error ? err.message : 'Unable to analyze simulated DM.');
      } finally {
        setSimulatingDm(false);
      }
    },
    [commitWorkspace, syncThreadWithConnector]
  );

  const handleSaveTemplate = useCallback(
    (template: ResponseTemplate) => {
      commitWorkspace((prev) => {
        const exists = prev.templates.some((t) => t.id === template.id);
        return {
          ...prev,
          templates: exists
            ? prev.templates.map((t) => (t.id === template.id ? template : t))
            : [template, ...prev.templates],
        };
      });
    },
    [commitWorkspace]
  );

  const handleDeleteTemplate = useCallback(
    (templateId: string) => {
      commitWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.filter((t) => t.id !== templateId),
      }));
    },
    [commitWorkspace]
  );

  const handleToggleTemplateActive = useCallback(
    (templateId: string) => {
      commitWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          t.id === templateId ? { ...t, active: !t.active } : t
        ),
      }));
    },
    [commitWorkspace]
  );

  const handleUpdateConnector = useCallback(
    (updated: CrmConnector) => {
      setCrmError(null);
      commitWorkspace((prev) => ({
        ...prev,
        connectors: prev.connectors.map((c) => (c.id === updated.id ? updated : c)),
      }));
    },
    [commitWorkspace]
  );

  const handleBatchSyncHighPriority = useCallback(
    async (providerId: CrmProviderId) => {
      const current = workspaceRef.current;
      const connector = current.connectors.find((c) => c.id === providerId);
      if (!connector || !connector.connected) {
        setCrmError('Enable this CRM connector before syncing leads.');
        return;
      }

      const qualifying = current.threads.filter(
        (t) => t.priorityScore >= connector.minPriorityScore && !t.crmSynced
      );
      const targets =
        qualifying.length > 0
          ? qualifying
          : current.threads.filter((t) => t.priorityScore >= connector.minPriorityScore).slice(0, 1);

      if (targets.length === 0) {
        setCrmError(
          `No leads currently meet the minimum priority score (${connector.minPriorityScore}/100).`
        );
        return;
      }

      setBatchSyncing(true);
      setCrmError(null);
      try {
        for (const lead of targets) {
          await syncThreadWithConnector(lead, connector);
        }
      } catch (err) {
        setCrmError(err instanceof Error ? err.message : 'Batch CRM sync encountered an error.');
      } finally {
        setBatchSyncing(false);
      }
    },
    [syncThreadWithConnector]
  );

  const handleUpdateSettings = useCallback(
    (nextSettings: AutomationSettings) => {
      commitWorkspace((prev) => ({
        ...prev,
        settings: nextSettings,
        threads: prev.threads.map((t) => ({
          ...t,
          priorityTier: classifyPriorityTier(t.priorityScore, nextSettings.highPriorityThreshold),
        })),
      }));
    },
    [commitWorkspace]
  );

  const handleResetDemoWorkspace = useCallback(async () => {
    const fresh = await resetWorkspaceOnServer();
    setWorkspace(fresh);
    workspaceRef.current = fresh;
    setSelectedThreadId(fresh.threads[0]?.id ?? null);
    setActionError(null);
    setCrmError(null);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        metrics={metrics}
        autoReplyEnabled={workspace.settings.autoReplyEnabled}
        connectedCrmName={activeConnector?.name ?? null}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">Workspace</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {SECTION_LABELS[activeSection]}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSimulateError(null);
              setSimulateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            Simulate DM
          </button>
        </header>

        {loadError && (
          <div role="alert" className="bg-red-50 border-b border-red-200 px-6 py-2.5 text-xs text-red-700">
            {loadError}
          </div>
        )}

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-12 gap-6 animate-pulse">
              <div className="md:col-span-4 space-y-3">
                <div className="h-10 bg-slate-200 rounded-lg" />
                <div className="h-24 bg-slate-200 rounded-lg" />
                <div className="h-24 bg-slate-200 rounded-lg" />
                <div className="h-24 bg-slate-200 rounded-lg" />
              </div>
              <div className="md:col-span-8 space-y-4">
                <div className="h-16 bg-slate-200 rounded-lg" />
                <div className="h-28 bg-slate-200 rounded-lg" />
                <div className="h-64 bg-slate-200 rounded-lg" />
              </div>
            </div>
          ) : activeSection === 'inbox' ? (
            <InboxView
              threads={workspace.threads}
              templates={workspace.templates}
              settings={workspace.settings}
              activeConnector={activeConnector}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
              onSendReply={handleSendReply}
              onReanalyzeThread={handleReanalyzeThread}
              onSyncThreadToCrm={handleSyncThreadToCrm}
              onOpenSimulateModal={() => {
                setSimulateError(null);
                setSimulateModalOpen(true);
              }}
              analyzingThreadId={analyzingThreadId}
              syncingThreadId={syncingThreadId}
              actionError={actionError}
              onClearActionError={() => setActionError(null)}
            />
          ) : activeSection === 'templates' ? (
            <TemplatesView
              templates={workspace.templates}
              defaultCalendarLink={workspace.settings.defaultCalendarLink}
              onSaveTemplate={handleSaveTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onToggleTemplateActive={handleToggleTemplateActive}
            />
          ) : activeSection === 'crm' ? (
            <CrmSyncView
              connectors={workspace.connectors}
              syncLogs={workspace.syncLogs}
              threads={workspace.threads}
              batchSyncing={batchSyncing}
              crmError={crmError}
              onUpdateConnector={handleUpdateConnector}
              onBatchSyncHighPriority={handleBatchSyncHighPriority}
            />
          ) : (
            <AutomationView
              settings={workspace.settings}
              metrics={metrics}
              instagramWebhookPath={instagramWebhookPath}
              onUpdateSettings={handleUpdateSettings}
              onResetDemoWorkspace={handleResetDemoWorkspace}
            />
          )}
        </main>
      </div>

      <SimulateDmModal
        open={simulateModalOpen}
        submitting={simulatingDm}
        errorMessage={simulateError}
        autoReplyEnabled={workspace.settings.autoReplyEnabled}
        onClose={() => {
          if (!simulatingDm) setSimulateModalOpen(false);
        }}
        onSubmit={handleSimulateDm}
      />
    </div>
  );
}
