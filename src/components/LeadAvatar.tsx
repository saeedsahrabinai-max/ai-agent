import { useState } from 'react';

interface LeadAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<LeadAvatarProps['size']>, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'IG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function LeadAvatar({ name, avatarUrl, size = 'md' }: LeadAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={`Profile photo of ${name}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-full object-cover border border-slate-200 bg-slate-100`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} shrink-0 rounded-full border border-slate-200 bg-slate-100 text-slate-700 font-semibold flex items-center justify-center select-none`}
    >
      {getInitials(name)}
    </div>
  );
}
