import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { useNavigator } from '../state/store';

type Props = {
  title: string;
  subtitle?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

/** The shared modal frame: backdrop, title, close button, Esc to close. */
export function Dialog({ title, subtitle, className, onClose, children }: Props) {
  const t = useT();
  const isTerrainDetailed = useNavigator((s) => s.isTerrainDetailed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className={`panel tool-dialog ${className ?? ''}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="calendar__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
            {!isTerrainDetailed && <p className="site-panel__refining">{t('panel.refining')}</p>}
          </div>
          <button type="button" className="icon-button" aria-label={t('cal.close')} onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
