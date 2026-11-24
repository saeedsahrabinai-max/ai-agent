import { useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import type { AutomationSettings } from '../types/agent';
import type { WorkspaceMetrics } from '../utils/agentLogic';

interface AutomationViewProps {
  settings: AutomationSettings;
  metrics: WorkspaceMetrics;
  instagramWebhookPath: string;
  onUpdateSettings: (next: AutomationSettings) => void;
  onResetDemoWorkspace: () => Promise<void>;
}

export function AutomationView({
  settings,
  metrics,
  instagramWebhookPath,
  onUpdateSettings,
  onResetDemoWorkspace,
}: AutomationViewProps) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [resetting, setResetting] = useState(false);

  const totalSentimentCount = Math.max(1, metrics.totalThreads);
  const positivePct = Math.round((metrics.sentimentBreakdown.positive / totalSentimentCount) * 100);
  const neutralPct = Math.round((metrics.sentimentBreakdown.neutral / totalSentimentCount) * 100);
  const negativeUrgentPct = Math.max(0, 100 - positivePct - neutralPct);

  const fullWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${instagramWebhookPath}`
      : instagramWebhookPath;

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(fullWebhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
    } catch {
      setCopiedWebhook(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await onResetDemoWorkspace();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Automation Rules &amp; Insights</h1>
            <p className="text-sm text-slate-600 mt-1">
              Control automatic DM responses, sentiment safety guardrails, and lead prioritization
              thresholds.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resetting ? 'Resetting...' : 'Reset Demo Data'}
          </button>
        </div>

        {/* Live Workspace Metrics Strip */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-slate-500">Active DM threads</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {metrics.totalThreads}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">High-priority leads</div>
              <div className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
                {metrics.highPriorityCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Auto-replied threads</div>
              <div className="mt-1 font-mono text-2xl font-bold text-indigo-700 tabular-nums">
                {metrics.autoRepliedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Estimated DM pipeline</div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                ${metrics.totalEstimatedPipeline.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700">Live sentiment distribution</span>
              <div className="flex items-center gap-3 font-mono tabular-nums text-slate-600">
                <span className="text-emerald-700">
                  Positive {metrics.sentimentBreakdown.positive} ({positivePct}%)
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-600">
                  Neutral {metrics.sentimentBreakdown.neutral} ({neutralPct}%)
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-red-700">
                  Urgent/Negative{' '}
                  {metrics.sentimentBreakdown.urgent + metrics.sentimentBreakdown.negative} (
                  {negativeUrgentPct}%)
                </span>
              </div>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-100 flex">
              <div
                style={{ width: `${positivePct}%` }}
                className="bg-emerald-600 transition-all duration-300"
              />
              <div
                style={{ width: `${neutralPct}%` }}
                className="bg-slate-400 transition-all duration-300"
              />
              <div
                style={{ width: `${negativeUrgentPct}%` }}
                className="bg-red-600 transition-all duration-300"
              />
            </div>
          </div>
        </div>

        {/* Automation Controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <h2 className="text-base font-semibold text-slate-900">Agent Behavior &amp; Guardrails</h2>

          <div className="divide-y divide-slate-100">
            <div className="py-4 first:pt-0 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">Automatic DM Replies</div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically send the AI-adapted template reply when an inbound Instagram DM
                  matches an auto-send eligible template.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.autoReplyEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, autoReplyEnabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Enabled
              </label>
            </div>

            <div className="py-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Negative &amp; Urgent Sentiment Guardrail
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hold threads classified as negative or urgent for human review instead of sending
                  an automatic reply.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.holdNegativeForReview}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, holdNegativeForReview: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Hold for review
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <label
                htmlFor="rule-high-threshold"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                High-priority lead threshold ({settings.highPriorityThreshold}/100)
              </label>
              <input
                id="rule-high-threshold"
                type="range"
                min={50}
                max={90}
                step={5}
                value={settings.highPriorityThreshold}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    highPriorityThreshold: Number(e.target.value),
                  })
                }
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <label
                htmlFor="rule-vip-followers"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                VIP account follower threshold
              </label>
              <input
                id="rule-vip-followers"
                type="number"
                min={1000}
                step={1000}
                value={settings.vipFollowerThreshold}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    vipFollowerThreshold: Math.max(1000, Number(e.target.value) || 25000),
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="rule-calendar-link"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Default booking link ({'{{calendar_link}}'})
              </label>
              <input
                id="rule-calendar-link"
                type="url"
                value={settings.defaultCalendarLink}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, defaultCalendarLink: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="rule-brand-voice"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Brand voice instructions for AI response drafting
              </label>
              <textarea
                id="rule-brand-voice"
                rows={3}
                value={settings.brandVoiceNotes}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, brandVoiceNotes: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Instagram Graph API Webhook Endpoint */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Instagram Graph API Webhook Endpoint
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Connect your Meta Developer App to forward live Instagram Direct Messages to this
            endpoint. Set <code className="font-mono text-slate-800">INSTAGRAM_VERIFY_TOKEN</code>{' '}
            in your server environment secrets to complete Meta’s verification handshake.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 truncate">
              {fullWebhookUrl}
            </code>
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedWebhook ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
