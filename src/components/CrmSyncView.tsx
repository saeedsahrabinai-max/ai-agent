import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, UploadCloud } from 'lucide-react';
import type { CrmConnector, CrmProviderId, CrmSyncRecord, LeadThread } from '../types/agent';
import { formatRelativeTime, formatSentimentLabel } from '../utils/agentLogic';

interface CrmSyncViewProps {
  connectors: CrmConnector[];
  syncLogs: CrmSyncRecord[];
  threads: LeadThread[];
  batchSyncing: boolean;
  crmError: string | null;
  onUpdateConnector: (connector: CrmConnector) => void;
  onBatchSyncHighPriority: (providerId: CrmProviderId) => Promise<void>;
}

export function CrmSyncView({
  connectors,
  syncLogs,
  threads,
  batchSyncing,
  crmError,
  onUpdateConnector,
  onBatchSyncHighPriority,
}: CrmSyncViewProps) {
  const [selectedId, setSelectedId] = useState<CrmProviderId>(
    connectors.find((c) => c.connected)?.id ?? connectors[0]?.id ?? 'hubspot'
  );
  const [expandedLogId, setExpandedLogId] = useState<string | null>(syncLogs[0]?.id ?? null);

  const selectedConnector =
    connectors.find((c) => c.id === selectedId) ?? connectors[0];

  if (!selectedConnector) return null;

  const eligibleUnsyncedCount = threads.filter(
    (t) => t.priorityScore >= selectedConnector.minPriorityScore && !t.crmSynced
  ).length;

  const toggleMapping = (index: number) => {
    const nextMappings = selectedConnector.fieldMappings.map((m, i) =>
      i === index ? { ...m, enabled: !m.enabled } : m
    );
    onUpdateConnector({ ...selectedConnector, fieldMappings: nextMappings });
  };

  const updateTargetField = (index: number, targetField: string) => {
    const nextMappings = selectedConnector.fieldMappings.map((m, i) =>
      i === index ? { ...m, targetField } : m
    );
    onUpdateConnector({ ...selectedConnector, fieldMappings: nextMappings });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">CRM Integrations</h1>
            <p className="text-sm text-slate-600 mt-1">
              Push high-priority Instagram leads, AI sentiment scores, and DM transcripts to your
              external CRM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onBatchSyncHighPriority(selectedConnector.id)}
            disabled={batchSyncing || !selectedConnector.connected}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {batchSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadCloud className="h-3.5 w-3.5" />
            )}
            {batchSyncing
              ? 'Syncing leads...'
              : `Sync High-Priority Leads (${eligibleUnsyncedCount} pending)`}
          </button>
        </div>

        {crmError && (
          <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {crmError}
          </div>
        )}

        {/* Connector Selector Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {connectors.map((connector) => {
            const isSelected = connector.id === selectedConnector.id;
            return (
              <button
                key={connector.id}
                type="button"
                onClick={() => setSelectedId(connector.id)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-indigo-50/60 border-indigo-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {connector.name}
                  </span>
                  <span
                    className={`text-xs font-medium shrink-0 ${
                      connector.connected ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {connector.connected ? 'Connected' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2">{connector.subtitle}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{connector.totalSynced} synced</span>
                  <span aria-hidden="true">·</span>
                  <span>Score &ge; {connector.minPriorityScore}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Connector Configuration */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{selectedConnector.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Target object: {selectedConnector.objectType}
                {selectedConnector.lastSyncedAt
                  ? ` · Last synced ${formatRelativeTime(selectedConnector.lastSyncedAt)}`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedConnector.connected}
                  onChange={(e) =>
                    onUpdateConnector({ ...selectedConnector, connected: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Connector active
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedConnector.autoSyncEnabled}
                  disabled={!selectedConnector.connected}
                  onChange={(e) =>
                    onUpdateConnector({ ...selectedConnector, autoSyncEnabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                />
                Auto-sync qualifying leads
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="crm-min-score"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Minimum priority score to sync ({selectedConnector.minPriorityScore}/100)
              </label>
              <input
                id="crm-min-score"
                type="range"
                min={30}
                max={95}
                step={5}
                value={selectedConnector.minPriorityScore}
                onChange={(e) =>
                  onUpdateConnector({
                    ...selectedConnector,
                    minPriorityScore: Number(e.target.value),
                  })
                }
                className="w-full accent-indigo-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Only Instagram leads meeting or exceeding this AI priority score are forwarded to{' '}
                {selectedConnector.name}.
              </p>
            </div>

            <div>
              <label
                htmlFor="crm-webhook-url"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Public HTTPS webhook destination (optional)
              </label>
              <input
                id="crm-webhook-url"
                type="url"
                value={selectedConnector.webhookUrl}
                onChange={(e) =>
                  onUpdateConnector({ ...selectedConnector, webhookUrl: e.target.value })
                }
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave empty for verified sandbox dispatch. Live HTTPS endpoints are validated
                server-side; configure optional Bearer tokens via server environment variables.
              </p>
            </div>
          </div>

          {/* Field Mapping Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">Field Mappings</h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Include</th>
                    <th className="py-2.5 px-3 font-medium">Threadline Source</th>
                    <th className="py-2.5 px-3 font-medium">{selectedConnector.name} Property</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedConnector.fieldMappings.map((mapping, idx) => (
                    <tr key={mapping.sourceField} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 w-16">
                        <input
                          type="checkbox"
                          aria-label={`Include ${mapping.sourceField}`}
                          checked={mapping.enabled}
                          onChange={() => toggleMapping(idx)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700">{mapping.sourceField}</td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          aria-label={`Target field for ${mapping.sourceField}`}
                          value={mapping.targetField}
                          onChange={(e) => updateTargetField(idx, e.target.value)}
                          className="w-full max-w-xs px-2.5 py-1 font-mono text-xs border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sync Delivery Log */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">CRM Sync Delivery Log</h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {syncLogs.length} events
            </span>
          </div>

          {syncLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No leads have been synced yet. Use “Sync High-Priority Leads” above to dispatch your
              priority queue.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {syncLogs.map((log) => {
                const expanded = expandedLogId === log.id;
                return (
                  <div key={log.id} className="px-6 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(expanded ? null : log.id)}
                        aria-expanded={expanded}
                        className="flex items-center gap-2 text-left min-w-0"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {log.leadName}
                        </span>
                        <span className="text-xs text-slate-500 truncate">{log.leadHandle}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-xs text-slate-600">{log.providerName}</span>
                      </button>

                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        <span className="text-slate-600">Score {log.priorityScore}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-sans text-slate-600">
                          {formatSentimentLabel(log.sentiment)}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span
                          className={
                            log.status === 'failed'
                              ? 'text-red-700 font-medium'
                              : 'text-emerald-700 font-medium'
                          }
                        >
                          {log.status === 'delivered'
                            ? `HTTP ${log.httpStatus} Live`
                            : log.status === 'sandbox_delivered'
                              ? `HTTP ${log.httpStatus} Sandbox`
                              : `Failed (${log.httpStatus})`}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-500">{formatRelativeTime(log.timestamp)}</span>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-3 ml-6 space-y-2">
                        <div className="text-xs text-slate-500 font-mono">
                          Record ID: {log.externalRecordId}
                          {log.errorMessage ? ` · Error: ${log.errorMessage}` : ''}
                        </div>
                        <pre className="p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto text-slate-800">
                          {JSON.stringify(log.payloadPreview, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
