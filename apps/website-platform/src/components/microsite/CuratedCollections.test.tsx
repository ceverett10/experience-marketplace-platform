import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CuratedCollections } from './CuratedCollections';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeCollection(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    slug: `collection-${id}`,
    name: `Collection ${id}`,
    description: `Description for collection ${id}`,
    iconEmoji: '\uD83C\uDFAD',
    imageUrl: null,
    collectionType: 'CURATED',
    products: [
      {
        id: `p-${id}-1`,
        product: { id: 'prod-1', primaryImageUrl: '/img/1.jpg', title: 'Product 1' },
      },
      {
        id: `p-${id}-2`,
        product: { id: 'prod-2', primaryImageUrl: '/img/2.jpg', title: 'Product 2' },
      },
    ],
    ...overrides,
  };
}

const defaultProps = {
  primaryColor: '#0d9488',
  siteName: 'Test Site',
};

describe('CuratedCollections', () => {
  it('returns null when collections array is empty', () => {
    const { container } = render(<CuratedCollections collections={[]} {...defaultProps} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders "Explore Collections" heading', () => {
    render(<CuratedCollections collections={[makeCollection('1')]} {...defaultProps} />);
    expect(screen.getByText('Explore Collections')).toBeInTheDocument();
  });

  it('renders section subtitle', () => {
    render(<CuratedCollections collections={[makeCollection('1')]} {...defaultProps} />);
    expect(screen.getByText('Curated experiences for every type of adventure')).toBeInTheDocument();
  });

  it('renders collection names', () => {
    const collections = [makeCollection('1'), makeCollection('2')];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('Collection 1')).toBeInTheDocument();
    expect(screen.getByText('Collection 2')).toBeInTheDocument();
  });

  it('shows collection descriptions', () => {
    const collections = [makeCollection('1', { description: 'A great collection' })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('A great collection')).toBeInTheDocument();
  });

  it('does not render description when it is null', () => {
    const collections = [makeCollection('1', { description: null, name: 'No Desc' })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('No Desc')).toBeInTheDocument();
    // No extra paragraph for description
  });

  it('shows experience count per collection with plural form', () => {
    const collections = [makeCollection('1')]; // has 2 products
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('2 experiences')).toBeInTheDocument();
  });

  it('uses singular "experience" for count of 1', () => {
    const collections = [
      makeCollection('1', {
        products: [
          {
            id: 'p-1',
            product: { id: 'prod-1', primaryImageUrl: '/img/1.jpg', title: 'Product 1' },
          },
        ],
      }),
    ];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('1 experience')).toBeInTheDocument();
  });

  it('shows "0 experiences" for empty product list', () => {
    const collections = [makeCollection('1', { products: [] })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('0 experiences')).toBeInTheDocument();
  });

  it('links to collection slug with /collections/ prefix', () => {
    const collections = [makeCollection('1', { slug: 'best-of-london' })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    const links = screen.getAllByRole('link');
    const collectionLink = links.find((link) =>
      link.getAttribute('href')?.includes('/collections/best-of-london')
    );
    expect(collectionLink).toBeDefined();
  });

  it('shows "View all" desktop link pointing to /collections', () => {
    const collections = [makeCollection('1')];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    const viewAll = screen.getByText('View all');
    expect(viewAll.closest('a')).toHaveAttribute('href', '/collections');
  });

  it('shows "View all collections" mobile link pointing to /collections', () => {
    const collections = [makeCollection('1')];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    const viewAllMobile = screen.getByText('View all collections');
    expect(viewAllMobile.closest('a')).toHaveAttribute('href', '/collections');
  });

  it('limits to 4 collections displayed', () => {
    const collections = [
      makeCollection('1'),
      makeCollection('2'),
      makeCollection('3'),
      makeCollection('4'),
      makeCollection('5'),
    ];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    expect(screen.getByText('Collection 1')).toBeInTheDocument();
    expect(screen.getByText('Collection 4')).toBeInTheDocument();
    expect(screen.queryByText('Collection 5')).not.toBeInTheDocument();
  });

  it('shows emoji icon in the badge', () => {
    const collections = [makeCollection('1', { iconEmoji: '\uD83C\uDF1F' })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    const emojiElements = screen.getAllByText('\uD83C\uDF1F');
    expect(emojiElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows default emoji when iconEmoji is null', () => {
    const collections = [makeCollection('1', { iconEmoji: null })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    // Default emoji is the box emoji
    const defaultEmojis = screen.getAllByText('\uD83D\uDCE6');
    expect(defaultEmojis.length).toBeGreaterThanOrEqual(1);
  });

  it('renders collection image when imageUrl is provided', () => {
    const collections = [makeCollection('1', { imageUrl: 'https://example.com/collection.jpg' })];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    const img = screen.getByAltText('Collection 1');
    expect(img).toHaveAttribute('src', 'https://example.com/collection.jpg');
  });

  it('applies primaryColor to "View all" link', () => {
    const collections = [makeCollection('1')];
    render(<CuratedCollections collections={collections} {...defaultProps} />);
    const viewAll = screen.getByText('View all').closest('a');
    expect(viewAll).toHaveStyle({ color: '#0d9488' });
  });
});
