import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders all breadcrumb items', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Experiences', href: '/experiences' },
          { label: 'London Eye Tour' },
        ]}
      />
    );

    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Experiences')).toBeDefined();
    expect(screen.getByText('London Eye Tour')).toBeDefined();
  });

  it('renders links for non-last items with href', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Experiences', href: '/experiences' },
          { label: 'Current Page' },
        ]}
      />
    );

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink?.getAttribute('href')).toBe('/');

    const expLink = screen.getByText('Experiences').closest('a');
    expect(expLink?.getAttribute('href')).toBe('/experiences');

    // Last item should not be a link
    const current = screen.getByText('Current Page');
    expect(current.closest('a')).toBeNull();
  });

  it('renders last item as non-link span', () => {
    render(<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />);

    const about = screen.getByText('About');
    expect(about.tagName.toLowerCase()).toBe('span');
  });

  it('renders separator chevrons between items', () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Page' }]} />
    );

    // Should have exactly one separator SVG (between 2 items)
    const svgs = container.querySelectorAll('li svg');
    expect(svgs.length).toBe(1);
  });

  it('applies custom className', () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: 'Home' }]} className="my-custom-class" />
    );
    expect(container.querySelector('.my-custom-class')).toBeDefined();
  });

  it('has correct aria-label', () => {
    render(<Breadcrumbs items={[{ label: 'Home' }]} />);
    expect(screen.getByLabelText('Breadcrumb')).toBeDefined();
  });
});
