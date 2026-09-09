/**
 * The in-UI squad switcher (issue #114): every squad the coach holds renders
 * as a link to its own addressable `/[season]/squad/[slug]` URL, with the
 * current one marked so it reads as a state, not just another option.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SquadSwitcher } from './SquadSwitcher.tsx';

describe('SquadSwitcher', () => {
  const squads = [
    { id: 2, name: 'Alpha Squad', slug: 'alpha-squad' },
    { id: 1, name: 'Descenders', slug: 'descenders' },
  ];

  it('links each squad to its own season/squad/slug URL', () => {
    const markup = renderToStaticMarkup(
      <SquadSwitcher seasonYear={2026} currentSlug="descenders" squads={squads} />,
    );
    expect(markup).toContain('href="/2026/squad/alpha-squad"');
    expect(markup).toContain('href="/2026/squad/descenders"');
  });

  it('preserves the selected checkpoint when switching squads', () => {
    const markup = renderToStaticMarkup(
      <SquadSwitcher seasonYear={2025} currentSlug="descenders" squads={squads} through={2} />,
    );
    expect(markup).toContain('href="/2025/squad/alpha-squad?through=2"');
    expect(markup).toContain('href="/2025/squad/descenders?through=2"');
  });

  it('renders every squad’s name', () => {
    const markup = renderToStaticMarkup(
      <SquadSwitcher seasonYear={2026} currentSlug="descenders" squads={squads} />,
    );
    expect(markup).toContain('Alpha Squad');
    expect(markup).toContain('Descenders');
  });

  it('marks the current squad with aria-current, and no other', () => {
    const markup = renderToStaticMarkup(
      <SquadSwitcher seasonYear={2026} currentSlug="descenders" squads={squads} />,
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
