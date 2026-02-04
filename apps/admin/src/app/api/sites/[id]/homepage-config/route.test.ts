import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { mockGenerateHomepageConfig } from '@/test/mocks/jobs';
import { createMockSite, createMockBrand } from '@/test/factories';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  generateHomepageConfig: mockGenerateHomepageConfig,
}));

import { GET, PUT, POST } from './route';

// Helper to create a mock Request with params
function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/sites/[id]/homepage-config', () => {
  it('returns homepage config for existing site', async () => {
    const site = createMockSite({
      homepageConfig: { hero: { title: 'Welcome' }, sections: [] },
    });
    mockPrisma.site.findUnique.mockResolvedValue(site);

    const response = await GET(
      createRequest('http://localhost/api/sites/site-1/homepage-config'),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.site.id).toBe(site.id);
    expect(data.site.homepageConfig).toEqual({ hero: { title: 'Welcome' }, sections: [] });
  });

  it('returns 404 when site does not exist', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    const response = await GET(
      createRequest('http://localhost/api/sites/nonexistent/homepage-config'),
      createParams('nonexistent')
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Site not found');
  });

  it('returns null homepageConfig when not yet configured', async () => {
    const site = createMockSite({ homepageConfig: null });
    mockPrisma.site.findUnique.mockResolvedValue(site);

    const response = await GET(
      createRequest('http://localhost/api/sites/site-1/homepage-config'),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.site.homepageConfig).toBeNull();
  });

  it('returns 500 when database query fails', async () => {
    mockPrisma.site.findUnique.mockRejectedValue(new Error('DB error'));

    const response = await GET(
      createRequest('http://localhost/api/sites/site-1/homepage-config'),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch homepage config');
  });
});

describe('PUT /api/sites/[id]/homepage-config', () => {
  it('updates homepage config successfully', async () => {
    const existingSite = createMockSite();
    const newConfig = { hero: { title: 'Updated Hero' }, sections: ['featured'] };
    const updatedSite = { ...existingSite, homepageConfig: newConfig };

    mockPrisma.site.findUnique.mockResolvedValue(existingSite);
    mockPrisma.site.update.mockResolvedValue(updatedSite);

    const response = await PUT(
      createRequest('http://localhost/api/sites/site-1/homepage-config', {
        method: 'PUT',
        body: JSON.stringify({ homepageConfig: newConfig }),
        headers: { 'Content-Type': 'application/json' },
      }),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Homepage config updated successfully');
    expect(data.site.homepageConfig).toEqual(newConfig);

    // Verify prisma.site.update was called correctly
    expect(mockPrisma.site.update).toHaveBeenCalledWith({
      where: { id: 'site-1' },
      data: { homepageConfig: newConfig },
      select: { id: true, name: true, homepageConfig: true },
    });
  });

  it('returns 404 when site does not exist', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    const response = await PUT(
      createRequest('http://localhost/api/sites/nonexistent/homepage-config', {
        method: 'PUT',
        body: JSON.stringify({ homepageConfig: {} }),
        headers: { 'Content-Type': 'application/json' },
      }),
      createParams('nonexistent')
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Site not found');
  });

  it('returns 500 when update fails', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(createMockSite());
    mockPrisma.site.update.mockRejectedValue(new Error('Update failed'));

    const response = await PUT(
      createRequest('http://localhost/api/sites/site-1/homepage-config', {
        method: 'PUT',
        body: JSON.stringify({ homepageConfig: {} }),
        headers: { 'Content-Type': 'application/json' },
      }),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to update homepage config');
  });
});

describe('POST /api/sites/[id]/homepage-config (AI generation)', () => {
  it('generates homepage config via AI and saves it', async () => {
    const brand = createMockBrand();
    const site = createMockSite({
      brand,
      opportunities: [
        {
          keyword: 'london tours',
          location: 'London',
          niche: 'city tours',
          searchVolume: 5000,
          intent: 'COMMERCIAL',
        },
      ],
      seoConfig: {
        toneOfVoice: { personality: ['Adventurous'], writingStyle: 'Engaging' },
        trustSignals: { expertise: ['10 years in tourism'] },
        brandStory: { mission: 'Help travelers explore' },
        contentGuidelines: { keyThemes: ['adventure', 'culture'] },
      },
    });

    const generatedConfig = {
      hero: { title: 'Discover London Tours', subtitle: 'Unforgettable experiences await' },
      sections: [{ type: 'featured', title: 'Top Experiences' }],
    };

    mockPrisma.site.findUnique.mockResolvedValue(site);
    mockGenerateHomepageConfig.mockResolvedValue(generatedConfig);
    mockPrisma.site.update.mockResolvedValue({
      ...site,
      homepageConfig: generatedConfig,
    });

    const response = await POST(
      createRequest('http://localhost/api/sites/site-1/homepage-config', { method: 'POST' }),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Homepage config generated successfully');

    // Verify generateHomepageConfig was called with opportunity + brand context
    expect(mockGenerateHomepageConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'london tours',
        location: 'London',
        niche: 'city tours',
      }),
      expect.objectContaining({
        name: brand.name,
        primaryColor: brand.primaryColor,
        toneOfVoice: expect.objectContaining({
          personality: ['Adventurous'],
        }),
      })
    );
  });

  it('returns 404 when site does not exist', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    const response = await POST(
      createRequest('http://localhost/api/sites/nonexistent/homepage-config', { method: 'POST' }),
      createParams('nonexistent')
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Site not found');
  });

  it('uses site name as fallback when no opportunity exists', async () => {
    const site = createMockSite({
      name: 'Adventure Tours Co',
      brand: createMockBrand(),
      opportunities: [],
      seoConfig: null,
    });

    mockPrisma.site.findUnique.mockResolvedValue(site);
    mockGenerateHomepageConfig.mockResolvedValue({ hero: {} });
    mockPrisma.site.update.mockResolvedValue({ ...site, homepageConfig: { hero: {} } });

    await POST(
      createRequest('http://localhost/api/sites/site-1/homepage-config', { method: 'POST' }),
      createParams('site-1')
    );

    expect(mockGenerateHomepageConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'Adventure Tours Co', // Falls back to site name
        niche: 'tours', // Default niche
      }),
      expect.objectContaining({
        toneOfVoice: expect.objectContaining({
          personality: ['Professional', 'Friendly'], // Defaults
        }),
      })
    );
  });

  it('returns 500 when AI generation fails', async () => {
    const site = createMockSite({
      brand: createMockBrand(),
      opportunities: [],
      seoConfig: null,
    });

    mockPrisma.site.findUnique.mockResolvedValue(site);
    mockGenerateHomepageConfig.mockRejectedValue(new Error('AI service unavailable'));

    const response = await POST(
      createRequest('http://localhost/api/sites/site-1/homepage-config', { method: 'POST' }),
      createParams('site-1')
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to generate homepage config');
  });
});
