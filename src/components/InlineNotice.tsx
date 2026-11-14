import { CheckCircle2, CircleAlert, Info } from 'lucide-react';

export interface Notice {
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface InlineNoticeProps {
  notice: Notice;
}

export function InlineNotice({ notice }: InlineNoticeProps) {
  const Icon =
    notice.kind === 'success' ? CheckCircle2 : notice.kind === 'error' ? CircleAlert : Info;

  return (
    <div className={`inline-notice inline-notice--${notice.kind}`} role="status">
      <Icon aria-hidden="true" size={16} />
      <span>{notice.message}</span>
    </div>
  );
}
