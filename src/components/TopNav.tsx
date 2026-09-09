'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

type TopNavProps = {
  qaPanel: React.ReactNode;
  qaPanelEnabled?: boolean;
  seasonHref: string;
  utilityControls: React.ReactNode;
};

/**
 * Temporary navigation shell for the first reporting increment.
 *
 * The QA panel intentionally owns no product-only control. `qaPanel` is also
 * rendered in the masthead when the panel is disabled, so removing this
 * temporary surface cannot strand season or account navigation.
 */
export function TopNav({
  qaPanel,
  qaPanelEnabled = true,
  seasonHref,
  utilityControls,
}: TopNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);
  const panelId = useId();
  const seasonIsCurrent = pathname === seasonHref || pathname === `${seasonHref}/`;

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(
        'a, button, select, input, textarea, [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, [open]);

  useEffect(() => {
    if (previousPathname.current !== pathname) setOpen(false);
    previousPathname.current = pathname;
  }, [pathname]);

  function closePanel() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <header className={`top-nav${qaPanelEnabled ? '' : ' top-nav-qa-disabled'}`}>
      <div className="top-nav-inner">
        <div className="top-nav-brand-group">
          {qaPanelEnabled ? (
            <button
              aria-controls={panelId}
              aria-expanded={open}
              className="top-nav-toggle"
              onClick={() => setOpen((current) => !current)}
              ref={toggleRef}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span className="sr-only">Open navigation</span>
            </button>
          ) : null}
          <Link aria-label="Descenders season wall" className="top-nav-brand" href={seasonHref}>
            Descenders
          </Link>
        </div>
        <nav aria-label="Reports" className="top-nav-reports">
          <Link aria-current={seasonIsCurrent ? 'page' : undefined} href={seasonHref}>
            Season
          </Link>
          <span aria-disabled="true">Race</span>
          <span aria-disabled="true">Squad</span>
          <span aria-disabled="true">Rider</span>
        </nav>
        {qaPanelEnabled ? null : (
          <div className="top-nav-utility top-nav-utility-expanded">
            {qaPanel}
            {utilityControls}
          </div>
        )}
      </div>
      {qaPanelEnabled && open ? (
        <nav
          aria-label="Temporary QA navigation"
          className="top-nav-panel"
          id={panelId}
          onChange={closePanel}
          onClickCapture={(event) => {
            if (event.target instanceof Element && event.target.closest('a')) closePanel();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closePanel();
            }
          }}
          ref={panelRef}
        >
          <p>Season and account</p>
          <div className="top-nav-panel-controls">
            {qaPanel}
            {utilityControls}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
