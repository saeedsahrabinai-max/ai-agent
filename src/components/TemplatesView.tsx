import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  IntentType,
  LeadPriorityTier,
  ResponseTemplate,
  SentimentType,
} from '../types/agent';
import {
  formatIntentLabel,
  formatPriorityLabel,
  formatSentimentLabel,
  interpolateTemplate,
} from '../utils/agentLogic';

interface TemplatesViewProps {
  templates: ResponseTemplate[];
  defaultCalendarLink: string;
  onSaveTemplate: (template: ResponseTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onToggleTemplateActive: (templateId: string) => void;
}

const INTENTS: IntentType[] = [
  'wholesale_inquiry',
  'purchase_intent',
  'brand_partnership',
  'support_escalation',
  'pricing_question',
  'general_engagement',
];

const SENTIMENTS: SentimentType[] = ['positive', 'neutral', 'negative', 'urgent'];
const PRIORITY_TIERS: LeadPriorityTier[] = ['low', 'medium', 'high', 'critical'];

export function TemplatesView({
  templates,
  defaultCalendarLink,
  onSaveTemplate,
  onDeleteTemplate,
  onToggleTemplateActive,
}: TemplatesViewProps) {
  const [selectedId, setSelectedId] = useState<string | 'new'>(templates[0]?.id ?? 'new');
  const existing = selectedId === 'new' ? null : templates.find((t) => t.id === selectedId) ?? null;

  const [name, setName] = useState(existing?.name ?? '');
  const [intent, setIntent] = useState<IntentType>(existing?.intent ?? 'wholesale_inquiry');
  const [sentiments, setSentiments] = useState<SentimentType[]>(
    existing?.sentiments ?? ['positive', 'neutral']
  );
  const [minPriorityTier, setMinPriorityTier] = useState<LeadPriorityTier>(
    existing?.minPriorityTier ?? 'high'
  );
  const [autoSendEligible, setAutoSendEligible] = useState(existing?.autoSendEligible ?? true);
  const [active, setActive] = useState(existing?.active ?? true);
  const [body, setBody] = useState(existing?.body ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const loadIntoForm = (tpl: ResponseTemplate | null) => {
    setFormError(null);
    setSavedNotice(null);
    if (!tpl) {
      setSelectedId('new');
      setName('');
      setIntent('wholesale_inquiry');
      setSentiments(['positive', 'neutral']);
      setMinPriorityTier('high');
      setAutoSendEligible(true);
      setActive(true);
      setBody(
        'Hi {{name}}, thanks for reaching out from {{company}}! We would love to discuss {{topic}}. Grab a time with our team here: {{calendar_link}}.'
      );
      return;
    }
    setSelectedId(tpl.id);
    setName(tpl.name);
    setIntent(tpl.intent);
    setSentiments(tpl.sentiments);
    setMinPriorityTier(tpl.minPriorityTier);
    setAutoSendEligible(tpl.autoSendEligible);
    setActive(tpl.active);
    setBody(tpl.body);
  };

  const toggleSentiment = (s: SentimentType) => {
    setSentiments((prev) =>
      prev.includes(s) ? prev.filter((item) => item !== s) : [...prev, s]
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanBody = body.trim();
    if (!cleanName) {
      setFormError('Template name is required.');
      return;
    }
    if (sentiments.length === 0) {
      setFormError('Select at least one target sentiment.');
      return;
    }
    if (cleanBody.length < 10) {
      setFormError('Template response body must be at least 10 characters.');
      return;
    }

    const templateToSave: ResponseTemplate = {
      id: existing ? existing.id : `tpl-${Date.now()}`,
      name: cleanName,
      intent,
      sentiments,
      minPriorityTier,
      autoSendEligible,
      active,
      body: cleanBody,
      usageCount: existing?.usageCount ?? 0,
      updatedAt: new Date().toISOString(),
    };

    onSaveTemplate(templateToSave);
    setSelectedId(templateToSave.id);
    setFormError(null);
    setSavedNotice('Template saved and active in AI matcher.');
  };

  const handleDelete = (tpl: ResponseTemplate) => {
    onDeleteTemplate(tpl.id);
    const remaining = templates.filter((t) => t.id !== tpl.id);
    loadIntoForm(remaining[0] ?? null);
  };

  const previewText = interpolateTemplate(body, {
    name: 'Maya Lindqvist',
    handle: '@maya.nordichome',
    company: 'Nordic Home Collective',
    topic: 'your 400-unit stoneware order',
    calendar_link: defaultCalendarLink,
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Response Templates</h1>
            <p className="text-sm text-slate-600 mt-1">
              Map AI-detected intents and sentiment states to personalized Instagram DM templates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadIntoForm(null)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Template List */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {templates.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-900">No templates yet</p>
                <p className="text-xs text-slate-500">
                  Create a template so the AI agent can draft consistent responses.
                </p>
              </div>
            ) : (
              templates.map((tpl) => {
                const isSelected = selectedId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className={`px-4 py-3.5 transition-colors ${
                      isSelected ? 'bg-indigo-50/70' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => loadIntoForm(tpl)}
                        className="text-left flex-1 min-w-0 focus-visible:outline-none"
                      >
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {tpl.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>{formatIntentLabel(tpl.intent)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{tpl.sentiments.map(formatSentimentLabel).join(', ')}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <span className={tpl.active ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                            {tpl.active ? 'Active' : 'Paused'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{tpl.autoSendEligible ? 'Auto-send allowed' : 'Manual review'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{tpl.usageCount} sent</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleTemplateActive(tpl.id)}
                          aria-label={`${tpl.active ? 'Pause' : 'Activate'} template ${tpl.name}`}
                          className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md whitespace-nowrap"
                        >
                          {tpl.active ? 'Pause' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tpl)}
                          aria-label={`Delete template ${tpl.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Template Editor */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {selectedId === 'new' ? 'Create Response Template' : 'Edit Response Template'}
              </h2>
              {savedNotice && (
                <span className="text-xs font-medium text-emerald-700">{savedNotice}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="tpl-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Template name
                </label>
                <input
                  id="tpl-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Wholesale VIP Fast-Track"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="tpl-intent" className="block text-xs font-medium text-slate-700 mb-1">
                  Target intent
                </label>
                <select
                  id="tpl-intent"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value as IntentType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {INTENTS.map((item) => (
                    <option key={item} value={item}>
                      {formatIntentLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tpl-tier" className="block text-xs font-medium text-slate-700 mb-1">
                  Minimum lead priority
                </label>
                <select
                  id="tpl-tier"
                  value={minPriorityTier}
                  onChange={(e) => setMinPriorityTier(e.target.value as LeadPriorityTier)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {PRIORITY_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {formatPriorityLabel(tier)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-2">
                Matching sentiments
              </span>
              <div className="flex flex-wrap gap-2">
                {SENTIMENTS.map((s) => {
                  const checked = sentiments.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSentiment(s)}
                      aria-pressed={checked}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        checked
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {formatSentimentLabel(s)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
                <label htmlFor="tpl-body" className="text-xs font-medium text-slate-700">
                  Response body
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  Variables: {'{{name}} {{handle}} {{company}} {{topic}} {{calendar_link}}'}
                </span>
              </div>
              <textarea
                id="tpl-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1">
              <div className="text-xs font-medium text-slate-500">Live variable preview</div>
              <p className="text-sm text-slate-800 leading-relaxed">{previewText || '—'}</p>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSendEligible}
                  onChange={(e) => setAutoSendEligible(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Eligible for automatic DM reply
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Template active
              </label>
            </div>

            {formError && (
              <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
              >
                Save Template
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
