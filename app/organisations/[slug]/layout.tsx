'use client';

import { ReactNode, useEffect } from 'react';

function findRegisterSection() {
  const heading = [...document.querySelectorAll('h2')].find((item) => item.textContent?.trim() === 'Commercial register');
  return heading?.closest('section') as HTMLElement | null;
}

export default function OrganisationLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    function handleMetricClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest('button.card.metric') as HTMLButtonElement | null;
      if (!button) return;

      const text = button.textContent ?? '';
      if (!text.includes('Open register') && !text.includes('Review readiness') && !text.includes('Assign ownership')) return;

      window.requestAnimationFrame(() => {
        const section = findRegisterSection();
        if (!section) return;
        section.id = 'commercial-register';
        const heading = section.querySelector('h2');
        if (heading instanceof HTMLElement) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState(null, '', '#commercial-register');
      });
    }

    document.addEventListener('click', handleMetricClick);
    return () => document.removeEventListener('click', handleMetricClick);
  }, []);

  return children;
}
