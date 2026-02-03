/**
 * Test factories for Page and Content models.
 */

let pageCounter = 0;
let contentCounter = 0;

export function createMockContent(overrides: Record<string, unknown> = {}) {
  contentCounter++;
  return {
    id: `content-${contentCounter}`,
    siteId: 'site-1',
    body: `<h1>Test Content ${contentCounter}</h1><p>This is test content.</p>`,
    bodyFormat: 'HTML',
    structuredData: null,
    isAiGenerated: true,
    aiModel: 'claude-3-sonnet',
    aiPrompt: null,
    qualityScore: 75,
    readabilityScore: 80,
    seoScore: 70,
    version: 1,
    previousVersionId: null,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20'),
    ...overrides,
  };
}

export function createMockPage(overrides: Record<string, unknown> = {}) {
  pageCounter++;
  return {
    id: `page-${pageCounter}`,
    siteId: 'site-1',
    slug: `test-page-${pageCounter}`,
    title: `Test Page ${pageCounter}`,
    metaTitle: `Test Page ${pageCounter} - Meta`,
    metaDescription: `Meta description for test page ${pageCounter}`,
    canonicalUrl: null,
    type: 'LANDING',
    status: 'DRAFT',
    contentId: null,
    holibobProductId: null,
    holibobCategoryId: null,
    holibobLocationId: null,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20'),
    ...overrides,
  };
}

export function createMockPageWithContent(overrides: Record<string, unknown> = {}) {
  const content = createMockContent();
  return createMockPage({
    contentId: content.id,
    content,
    ...overrides,
  });
}

export function createMockPageWithSite(overrides: Record<string, unknown> = {}) {
  return createMockPage({
    site: { id: 'site-1', name: 'Test Site 1' },
    content: null,
    ...overrides,
  });
}

export function createMockContentList(count: number) {
  return Array.from({ length: count }, (_, i) =>
    createMockPageWithSite({
      id: `page-list-${i}`,
      title: `Listed Page ${i}`,
      content: i % 2 === 0 ? createMockContent({ id: `content-list-${i}` }) : null,
    })
  );
}
