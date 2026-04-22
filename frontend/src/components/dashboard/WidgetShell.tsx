import type { ReactNode } from 'react';

interface WidgetShellProps {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

export function WidgetShell({ title, subtitle, badge, children, actions, compact = false }: WidgetShellProps) {
  return (
    <section className={`widget-shell ${compact ? 'widget-shell-compact' : ''}`}>
      <div className="widget-shell-header">
        <div>
          <div className="widget-shell-title-row">
            <h3 className="widget-shell-title">{title}</h3>
            {badge && <span className="widget-shell-badge">{badge}</span>}
          </div>
          {subtitle && <p className="widget-shell-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="widget-shell-actions">{actions}</div>}
      </div>
      <div className="widget-shell-body">{children}</div>
    </section>
  );
}
