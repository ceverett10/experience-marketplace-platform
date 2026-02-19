import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParentDomainHomepage } from './ParentDomainHomepage';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const defaultProps = {
  suppliers: [
    {
      id: 'sup-1',
      name: 'London Walking Tours',
      slug: 'london-walking-tours',
      productCount: 15,
      cities: ['London'],
      categories: ['Walking Tours'],
      logoUrl: '/logo.png',
    },
    {
      id: 'sup-2',
      name: 'Paris Adventures',
      slug: 'paris-adventures',
      productCount: 8,
      cities: ['Paris'],
      categories: ['Adventure'],
      logoUrl: null,
    },
  ],
  categories: [
    { name: 'Walking Tours', count: 20 },
    { name: 'Food & Drink', count: 15 },
  ],
  cities: [
    { name: 'London', count: 25 },
    { name: 'Paris', count: 12 },
  ],
  stats: {
    totalSuppliers: 50,
    totalProducts: 500,
    totalCities: 30,
    totalCategories: 15,
    activeMicrosites: 45,
  },
  sites: [
    {
      id: 'site-1',
      name: 'London Tours',
      hostname: 'london-tours.experiencess.com',
      logoUrl: '/site-logo.png',
      primaryColor: '#0d9488',
      productCount: 10,
    },
  ],
} as any;

describe('ParentDomainHomepage', () => {
  it('renders hero section with title', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    expect(screen.getByText('Experiencess')).toBeDefined();
  });

  it('renders platform stats', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    expect(screen.getByText('50')).toBeDefined(); // suppliers
    expect(screen.getByText('500+')).toBeDefined(); // products
    expect(screen.getByText('30')).toBeDefined(); // cities
  });

  it('renders supplier listings', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    expect(screen.getByText('London Walking Tours')).toBeDefined();
    expect(screen.getByText('Paris Adventures')).toBeDefined();
  });

  it('renders category listings', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    expect(screen.getByText('Walking Tours')).toBeDefined();
    expect(screen.getByText('Food & Drink')).toBeDefined();
  });

  it('renders city listings', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    // Cities appear in supplier details and city section
    expect(screen.getAllByText('London').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Paris').length).toBeGreaterThanOrEqual(1);
  });

  it('renders CTA buttons in hero', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    expect(screen.getAllByText('Our Brands').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Our Providers').length).toBeGreaterThanOrEqual(1);
  });

  it('renders stat labels', () => {
    render(<ParentDomainHomepage {...defaultProps} />);
    expect(screen.getByText('Experience Providers')).toBeDefined();
    expect(screen.getByText('Tours & Activities')).toBeDefined();
  });
});
