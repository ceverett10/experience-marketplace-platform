import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentRenderer } from './ContentRenderer';

describe('ContentRenderer', () => {
  describe('text format', () => {
    it('renders plain text paragraphs', () => {
      render(<ContentRenderer content={'Hello\nWorld'} format="text" />);
      expect(screen.getByText('Hello')).toBeDefined();
      expect(screen.getByText('World')).toBeDefined();
    });

    it('splits on newlines', () => {
      render(<ContentRenderer content={'Line 1\nLine 2\nLine 3'} format="text" />);
      const paragraphs = document.querySelectorAll('p');
      expect(paragraphs.length).toBe(3);
    });

    it('applies custom className', () => {
      const { container } = render(
        <ContentRenderer content="Test" format="text" className="custom-class" />
      );
      expect(container.firstElementChild!.classList.contains('custom-class')).toBe(true);
    });
  });

  describe('html format', () => {
    it('renders HTML content', () => {
      render(
        <ContentRenderer content="<h1>Title</h1><p>Paragraph</p>" format="html" />
      );
      expect(screen.getByText('Title')).toBeDefined();
      expect(screen.getByText('Paragraph')).toBeDefined();
    });

    it('renders nested HTML elements', () => {
      render(
        <ContentRenderer
          content='<ul><li>Item 1</li><li>Item 2</li></ul>'
          format="html"
        />
      );
      expect(screen.getByText('Item 1')).toBeDefined();
      expect(screen.getByText('Item 2')).toBeDefined();
    });
  });

  describe('markdown format (default)', () => {
    it('renders markdown headings', () => {
      render(<ContentRenderer content="# Heading 1" />);
      expect(screen.getByText('Heading 1')).toBeDefined();
    });

    it('renders markdown paragraphs', () => {
      render(<ContentRenderer content="A paragraph of text." />);
      expect(screen.getByText('A paragraph of text.')).toBeDefined();
    });

    it('renders markdown links', () => {
      render(<ContentRenderer content="[Click here](https://example.com)" />);
      const link = screen.getByText('Click here');
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('https://example.com');
    });

    it('sets external links to open in new tab', () => {
      render(<ContentRenderer content="[Link](https://example.com)" />);
      const link = screen.getByText('Link');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('renders markdown lists', () => {
      render(<ContentRenderer content={'- Item A\n- Item B'} />);
      expect(screen.getByText('Item A')).toBeDefined();
      expect(screen.getByText('Item B')).toBeDefined();
    });

    it('renders blockquotes', () => {
      render(<ContentRenderer content="> A quote" />);
      const blockquote = document.querySelector('blockquote');
      expect(blockquote).toBeTruthy();
    });

    it('renders images', () => {
      render(<ContentRenderer content="![Alt text](/image.jpg)" />);
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.getAttribute('alt')).toBe('Alt text');
    });

    it('uses markdown format by default', () => {
      render(<ContentRenderer content="**bold text**" />);
      const strong = document.querySelector('strong');
      expect(strong).toBeTruthy();
      expect(strong!.textContent).toBe('bold text');
    });

    it('applies prose class', () => {
      const { container } = render(<ContentRenderer content="Test" />);
      expect(container.firstElementChild!.classList.contains('prose')).toBe(true);
    });
  });
});
