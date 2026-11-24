import {
  FileText,
  Inbox,
  Link2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { ActiveNavSection } from '../types/agent';
import type { WorkspaceMetrics } from '../utils/agentLogic';

interface SidebarProps {
  activeSection: ActiveNavSection;
  onSelectSection: (section: ActiveNavSection) => void;
  metrics: WorkspaceMetrics;
  autoReplyEnabled: boolean;
  connectedCrmName: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: ActiveNavSection;
  label: string;
  icon: typeof Inbox;
}> = [
  { id: 'inbox', label: 'Priority Inbox', icon: Inbox },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'crm', label: 'CRM Sync', icon: Link2 },
  { id: 'automation', label: 'Automation', icon: SlidersHorizontal },
];

export function Sidebar({
  activeSection,
  onSelectSection,
  metrics,
  autoReplyEnabled,
  connectedCrmName,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleNav = (id: ActiveNavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200 w-60 shrink-0">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Threadline
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-2 -mr-2 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="p-3 space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const count =
            item.id === 'inbox'
              ? metrics.needsReviewCount
              : item.id === 'crm'
                ? metrics.crmSyncedCount
                : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
              {count !== null && (
                <span
                  className={`font-mono text-xs tabular-nums ${
                    isActive ? 'text-indigo-700 font-semibold' : 'text-slate-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-5 border-t border-slate-200 space-y-3">
        <div className="text-xs font-medium text-slate-500">Queue Snapshot</div>
        <dl className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">High-priority leads</dt>
            <dd className="font-mono font-semibold text-slate-900 tabular-nums">
              {metrics.highPriorityCount}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Est. DM pipeline</dt>
            <dd className="font-mono font-semibold text-slate-900 tabular-nums">
              ${metrics.totalEstimatedPipeline.toLocaleString()}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Auto-reply</dt>
            <dd className={`font-medium ${autoReplyEnabled ? 'text-emerald-700' : 'text-slate-600'}`}>
              {autoReplyEnabled ? 'Active' : 'Paused'}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Active CRM</dt>
            <dd className="text-slate-900 font-medium truncate max-w-[110px]">
              {connectedCrmName ?? 'None'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-full shrink-0">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
