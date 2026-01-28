'use client';

/**
 * Site Context Provider
 * Provides site configuration to client components
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteConfig } from './tenant';
import { DEFAULT_SITE_CONFIG } from './tenant';

const SiteContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG);

export interface SiteProviderProps {
  site: SiteConfig;
  children: ReactNode;
}

export function SiteProvider({ site, children }: SiteProviderProps) {
  return (
    <SiteContext.Provider value={site}>
      {children}
    </SiteContext.Provider>
  );
}

/**
 * Hook to access site configuration
 */
export function useSite(): SiteConfig {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used within a SiteProvider');
  }
  return context;
}

/**
 * Hook to access brand configuration
 */
export function useBrand() {
  const site = useSite();
  return site.brand ?? DEFAULT_SITE_CONFIG.brand;
}

/**
 * Hook to access SEO configuration
 */
export function useSEO() {
  const site = useSite();
  return site.seoConfig ?? DEFAULT_SITE_CONFIG.seoConfig;
}
