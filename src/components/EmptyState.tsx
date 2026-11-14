import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon aria-hidden="true" size={22} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
