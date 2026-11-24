import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

export interface SimulatedDmInput {
  handle: string;
  displayName: string;
  company: string;
  followers: number;
  isVerified: boolean;
  messageText: string;
}

interface SimulateDmModalProps {
  open: boolean;
  submitting: boolean;
  errorMessage: string | null;
  autoReplyEnabled: boolean;
  onClose: () => void;
  onSubmit: (input: SimulatedDmInput) => Promise<void>;
}

const PRESETS: Array<{ label: string; data: SimulatedDmInput }> = [
  {
    label: 'Wholesale Buyer',
    data: {
      handle: '@claire.atelierhome',
      displayName: 'Claire Beaumont',
      company: 'Atelier Home Paris',
      followers: 62000,
      isVerified: true,
      messageText:
        'Bonjour! We stock independent home goods across 4 Paris showrooms. Looking to place an opening wholesale order of 300 ceramic pieces before March — could you share wholesale terms and lead times?',
    },
  },
  {
    label: 'Urgent VIP Issue',
    data: {
      handle: '@jordan.meridian',
      displayName: 'Jordan Ellis',
      company: 'Meridian Architecture',
      followers: 41500,
      isVerified: false,
      messageText:
        'Two of the brass sconces from our $4,800 commercial order #MA-991 arrived damaged and our client walkthrough is tomorrow afternoon. We need an urgent replacement shipped overnight.',
    },
  },
  {
    label: 'Creator Collab',
    data: {
      handle: '@nina.slowspaces',
      displayName: 'Nina Takahashi',
      company: 'Slow Spaces Media',
      followers: 195000,
      isVerified: true,
      messageText:
        'Love your new minimalist tableware drop! I am producing a spring dining room makeover series on Reels and YouTube (350K avg reach). Would love to discuss a sponsored feature.',
    },
  },
];

export function SimulateDmModal({
  open,
  submitting,
  errorMessage,
  autoReplyEnabled,
  onClose,
  onSubmit,
}: SimulateDmModalProps) {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [followers, setFollowers] = useState('12500');
  const [isVerified, setIsVerified] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!open) return null;

  const applyPreset = (data: SimulatedDmInput) => {
    setHandle(data.handle);
    setDisplayName(data.displayName);
    setCompany(data.company);
    setFollowers(String(data.followers));
    setIsVerified(data.isVerified);
    setMessageText(data.messageText);
    setValidationError(null);
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanHandle = handle.trim();
    const cleanName = displayName.trim();
    const cleanMessage = messageText.trim();
    const parsedFollowers = Number(followers);

    if (!cleanHandle) {
      setValidationError('Enter an Instagram handle (for example, @studio.buyer).');
      return;
    }
    if (!cleanName) {
      setValidationError('Enter the sender display name.');
      return;
    }
    if (!Number.isFinite(parsedFollowers) || parsedFollowers < 0) {
      setValidationError('Follower count must be a non-negative number.');
      return;
    }
    if (cleanMessage.length < 5) {
      setValidationError('Enter a direct message of at least 5 characters.');
      return;
    }

    setValidationError(null);
    await onSubmit({
      handle: cleanHandle.startsWith('@') ? cleanHandle : `@${cleanHandle}`,
      displayName: cleanName,
      company: company.trim(),
      followers: Math.round(parsedFollowers),
      isVerified,
      messageText: cleanMessage,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulate-dm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="simulate-dm-title" className="text-base font-semibold text-slate-900">
              Simulate Incoming Instagram DM
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs live AI sentiment analysis, lead priority scoring, template matching, and CRM routing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close simulate DM dialog"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Quick test scenarios</span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.data)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sim-handle" className="block text-xs font-medium text-slate-700 mb-1">
                Instagram handle
              </label>
              <input
                id="sim-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@alex.retailgroup"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="sim-name" className="block text-xs font-medium text-slate-700 mb-1">
                Sender name
              </label>
              <input
                id="sim-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="sim-company" className="block text-xs font-medium text-slate-700 mb-1">
                Company or brand (optional)
              </label>
              <input
                id="sim-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Rivera Concept Stores"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label
                  htmlFor="sim-followers"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Followers
                </label>
                <input
                  id="sim-followers"
                  type="number"
                  min={0}
                  value={followers}
                  onChange={(e) => setFollowers(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-slate-700 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isVerified}
                  onChange={(e) => setIsVerified(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Verified
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="sim-message" className="block text-xs font-medium text-slate-700 mb-1">
              Direct message text
            </label>
            <textarea
              id="sim-message"
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Write the inbound Instagram DM to analyze..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {validationError && (
            <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {validationError}
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 gap-4">
            <p className="text-xs text-slate-500">
              {autoReplyEnabled
                ? 'Auto-reply is active: eligible positive/neutral leads will be replied to automatically.'
                : 'Auto-reply is paused: AI will analyze and stage a draft for manual review.'}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Analyzing DM...' : 'Analyze & Ingest DM'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
