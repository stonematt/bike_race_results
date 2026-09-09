// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Link from 'next/link';
import { afterEach, expect, it, vi } from 'vitest';
import { TopNav } from './TopNav.tsx';

const navigation = vi.hoisted(() => ({ pathname: '/2055' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

afterEach(() => {
  cleanup();
  navigation.pathname = '/2055';
});

it('opens the temporary QA navigation and returns focus to its toggle when dismissed', () => {
  render(
    <TopNav
      qaPanel={<Link href="/2055/operations">Club operations</Link>}
      seasonControls={<Link href="/2055">2055 season</Link>}
      seasonHref="/2055"
      utilityControls={<button>Sign out</button>}
    />,
  );

  const toggle = screen.getByRole('button', { name: 'Open navigation' });
  expect(screen.getByRole('link', { name: 'Descenders season wall' })).toHaveAttribute(
    'href',
    '/2055',
  );
  expect(screen.getByRole('navigation', { name: 'Reports' })).toHaveTextContent('Season');
  expect(screen.getByText('Race')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByRole('navigation', { name: 'Temporary QA navigation' })).toBeNull();

  fireEvent.click(toggle);
  const panel = screen.getByRole('navigation', { name: 'Temporary QA navigation' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: '2055 season' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();

  fireEvent.keyDown(panel, { key: 'Escape' });
  expect(screen.queryByRole('navigation', { name: 'Temporary QA navigation' })).toBeNull();
  expect(toggle).toHaveFocus();
});

it('keeps required utility controls in the masthead when the removable QA panel is disabled', () => {
  render(
    <TopNav
      qaPanel={<Link href="/2055/operations">Club operations</Link>}
      seasonControls={<Link href="/2055">2055 season</Link>}
      qaPanelEnabled={false}
      seasonHref="/2055"
      utilityControls={<button>Sign out</button>}
    />,
  );

  expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Temporary QA navigation' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(screen.getByRole('link', { name: '2055 season' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Club operations' })).toBeNull();
});

it('marks Season current only on the season wall', () => {
  navigation.pathname = '/2055/operations';
  render(
    <TopNav
      qaPanel={<Link href="/2055/operations">Club operations</Link>}
      seasonControls={<Link href="/2055">2055 season</Link>}
      seasonHref="/2055"
      utilityControls={<button>Sign out</button>}
    />,
  );

  expect(screen.getByRole('link', { name: 'Season' })).not.toHaveAttribute('aria-current');
});

it('closes the temporary panel when a season route transition completes', async () => {
  const props = {
    qaPanel: <Link href="/2055/operations">Club operations</Link>,
    seasonControls: <Link href="/2055">2055 season</Link>,
    seasonHref: '/2055',
    utilityControls: <button>Sign out</button>,
  };
  const view = render(<TopNav {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  expect(screen.getByRole('navigation', { name: 'Temporary QA navigation' })).toBeVisible();

  navigation.pathname = '/2026';
  view.rerender(<TopNav {...props} />);
  await waitFor(() => {
    expect(screen.queryByRole('navigation', { name: 'Temporary QA navigation' })).toBeNull();
  });
});
