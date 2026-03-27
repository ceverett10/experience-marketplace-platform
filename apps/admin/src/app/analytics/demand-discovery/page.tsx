'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { MetricCard } from '../components/MetricCard';
import { TrendIndicator } from '../components/TrendIndicator';

// ============================================================================
// Types
// ============================================================================

type Tab = 'global' | 'cities' | 'categories' | 'opportunities' | 'trending' | 'research';

interface CityDemandItem {
  city: string;
  productCount: number;
  categoryCount: number;
  supplierCount: number;
  topCategories: string[];
  avgPrice: number;
  searchVolume: number;
  avgCpc: number;
  avgDifficulty: number;
  gscClicks: number;
  gscImpressions: number;
  bookings: number;
  revenue: number;
  activeCampaigns: number;
  demandScore: number;
}

interface CityDemandResponse {
  cities: CityDemandItem[];
  totals: { cities: number; totalVolume: number; totalRevenue: number };
}

interface CategoryDemandItem {
  category: string;
  productCount: number;
  cityCount: number;
  topCities: string[];
  avgPrice: number;
  searchVolume: number;
  avgCpc: number;
  avgDifficulty: number;
  bookings: number;
  revenue: number;
  activeCampaigns: number;
}

interface CategoryDemandResponse {
  categories: CategoryDemandItem[];
  totals: { categories: number; totalVolume: number; totalRevenue: number };
}

interface OpportunityItem {
  city: string;
  category: string;
  productCount: number;
  avgPrice: number;
  searchVolume: number;
  cpc: number;
  intent: string;
  topKeywords: string[];
  revenuePerClick: number;
  predictedRoas: number;
  opportunityScore: number;
  hasCampaign: boolean;
  campaignStatus: string | null;
  campaignRoas: number | null;
}

interface OpportunityResponse {
  opportunities: OpportunityItem[];
  totals: {
    total: number;
    displayed: number;
    uncoveredHighValue: number;
    avgPredictedRoas: number;
  };
  assumptions: { aov: number; cvr: number; commissionRate: number };
}

interface TrendingItem {
  query: string;
  currentImpressions: number;
  priorImpressions: number;
  impressionChange: number;
  currentClicks: number;
  priorClicks: number;
  clickChange: number;
  isBreakout: boolean;
  isNew: boolean;
}

interface TrendingResponse {
  rising: TrendingItem[];
  breakouts: TrendingItem[];
  declining: TrendingItem[];
  totals: { risingCount: number; breakoutCount: number; decliningCount: number };
}

interface ResearchKeyword {
  keyword: string;
  searchVolume: number;
  cpc: number;
  difficulty: number;
  intent: string;
  location: string | null;
  niche: string;
  status: string;
  priorityScore: number;
}

interface ResearchProduct {
  title: string;
  city: string | null;
  categories: string[];
  price: number;
  rating: number | null;
  bookings: number;
}

interface ResearchCampaign {
  name: string;
  platform: string;
  status: string;
  keywords: string[];
  dailyBudget: number;
  totalSpend: number;
  totalClicks: number;
  roas: number | null;
}

interface ResearchResponse {
  query: { city?: string; category?: string };
  summary: {
    totalKeywords: number;
    totalSearchVolume: number;
    avgCpc: number;
    avgDifficulty: number;
    matchingProducts: number;
    avgProductPrice: number;
    existingCampaigns: number;
  };
  keywords: ResearchKeyword[];
  gscPerformance: Array<{
    term: string;
    clicks: number;
    impressions: number;
    avgPosition: number;
  }>;
  products: ResearchProduct[];
  campaigns: ResearchCampaign[];
  suggestedSearchTerms: string[];
}

interface GlobalDemandCategory {
  category: string;
  totalSearchVolume: number;
  keywordCount: number;
  avgCpc: number;
  avgDifficulty: number;
  topLocations: Array<{ location: string; volume: number }>;
  topKeywords: Array<{ keyword: string; volume: number; cpc: number }>;
}

interface GlobalDemandLocation {
  location: string;
  totalSearchVolume: number;
  categoryCount: number;
  topCategories: string[];
}

interface GlobalRisingQuery {
  query: string;
  currentImpressions: number;
  priorImpressions: number;
  growth: number;
  clicks: number;
}

interface GoogleTrendItem {
  category: string;
  avgTrendScore: number;
  totalSearchVolume: number;
  avgCpc: number;
  direction: string;
  demandScore: number;
  locationCount: number;
  topLocations: Array<{ location: string; trendScore: number }>;
}

interface GlobalDemandResponse {
  categories: GlobalDemandCategory[];
  topLocations: GlobalDemandLocation[];
  risingQueries: GlobalRisingQuery[];
  googleTrends: GoogleTrendItem[];
  totals: {
    totalCategories: number;
    totalSearchVolume: number;
    totalKeywords: number;
    risingQueryCount: number;
    googleTrendsCategories: number;
    lastTrendCollection: string | null;
  };
}

type SortDirection = 'asc' | 'desc';

// ============================================================================
// Helpers
// ============================================================================

function DemandScoreBadge({ score }: { score: number }) {
  let colorClass = 'bg-red-100 text-red-700';
  if (score >= 70) colorClass = 'bg-green-100 text-green-700';
  else if (score >= 50) colorClass = 'bg-yellow-100 text-yellow-700';
  else if (score >= 30) colorClass = 'bg-orange-100 text-orange-700';

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>{score}</span>;
}

function RoasBadge({ roas }: { roas: number }) {
  let colorClass = 'bg-red-100 text-red-700';
  if (roas >= 2) colorClass = 'bg-green-100 text-green-700';
  else if (roas >= 1) colorClass = 'bg-yellow-100 text-yellow-700';
  else if (roas >= 0.5) colorClass = 'bg-orange-100 text-orange-700';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {roas.toFixed(1)}x
    </span>
  );
}

function CampaignBadge({ hasCampaign, status }: { hasCampaign: boolean; status: string | null }) {
  if (!hasCampaign) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
        Uncovered
      </span>
    );
  }
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    DRAFT: 'bg-blue-100 text-blue-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${colorMap[status || ''] || 'bg-slate-100 text-slate-600'}`}
    >
      {status || 'Unknown'}
    </span>
  );
}

function IntentBadge({ intent }: { intent: string }) {
  const colorMap: Record<string, string> = {
    TRANSACTIONAL: 'bg-green-100 text-green-700',
    COMMERCIAL: 'bg-blue-100 text-blue-700',
    INFORMATIONAL: 'bg-slate-100 text-slate-600',
    NAVIGATIONAL: 'bg-purple-100 text-purple-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${colorMap[intent] || 'bg-slate-100 text-slate-600'}`}
    >
      {intent}
    </span>
  );
}

function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  align = 'right',
}: {
  label: string;
  field: string;
  currentSort: string;
  currentDirection: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === field;
  return (
    <th
      className={`text-${align} text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-700 select-none`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && <span className="text-sky-600">{currentDirection === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 w-20 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Sort hook
// ============================================================================

function useSort<T>(
  data: T[] | null,
  defaultField: string,
  defaultDirection: SortDirection = 'desc'
) {
  const [sortField, setSortField] = useState(defaultField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
    },
    [sortField]
  );

  const sorted = useMemo(() => {
    if (!data) return null;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortField];
      const bVal = (b as Record<string, unknown>)[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal || '');
      const bStr = String(bVal || '');
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, sortField, sortDirection]);

  return { sorted, sortField, sortDirection, handleSort };
}

// ============================================================================
// Main Page
// ============================================================================

const TABS: { id: Tab; label: string }[] = [
  { id: 'global', label: 'Global Demand' },
  { id: 'cities', label: 'City Demand' },
  { id: 'categories', label: 'Categories' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'trending', label: 'Trending' },
  { id: 'research', label: 'Research' },
];

export default function DemandDiscoveryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const [loading, setLoading] = useState(false);

  // Data states
  const [cityData, setCityData] = useState<CityDemandResponse | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryDemandResponse | null>(null);
  const [opportunityData, setOpportunityData] = useState<OpportunityResponse | null>(null);
  const [trendingData, setTrendingData] = useState<TrendingResponse | null>(null);
  const [researchData, setResearchData] = useState<ResearchResponse | null>(null);
  const [globalData, setGlobalData] = useState<GlobalDemandResponse | null>(null);

  // Research form
  const [researchCity, setResearchCity] = useState('');
  const [researchCategory, setResearchCategory] = useState('');

  // Track which tabs have been loaded
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set());

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const [tabError, setTabError] = useState<string | null>(null);

  const fetchTabData = useCallback(
    async (tab: Tab) => {
      if (loadedTabs.has(tab) && tab !== 'research') return;

      setLoading(true);
      setTabError(null);
      try {
        const endpoints: Record<string, string> = {
          global: '/api/analytics/demand-discovery/global-demand?days=30',
          cities: '/api/analytics/demand-discovery/city-demand?days=30',
          categories: '/api/analytics/demand-discovery/category-demand?days=30',
          opportunities: '/api/analytics/demand-discovery/opportunities?limit=200',
          trending: '/api/analytics/demand-discovery/trending',
        };

        const endpoint = endpoints[tab];
        if (!endpoint) return;

        const res = await fetch(`${basePath}${endpoint}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setTabError(err.error || `Failed to load ${tab} data (${res.status})`);
          return;
        }

        const data = await res.json();
        switch (tab) {
          case 'global':
            setGlobalData(data);
            break;
          case 'cities':
            setCityData(data);
            break;
          case 'categories':
            setCategoryData(data);
            break;
          case 'opportunities':
            setOpportunityData(data);
            break;
          case 'trending':
            setTrendingData(data);
            break;
        }
        setLoadedTabs((prev) => new Set([...prev, tab]));
      } catch (err) {
        setTabError(err instanceof Error ? err.message : `Failed to fetch ${tab} data`);
      } finally {
        setLoading(false);
      }
    },
    [basePath, loadedTabs]
  );

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  const handleResearch = useCallback(async () => {
    if (!researchCity && !researchCategory) return;
    setLoading(true);
    try {
      const res = await fetch(`${basePath}/api/analytics/demand-discovery/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: researchCity || undefined,
          category: researchCategory || undefined,
        }),
      });
      if (res.ok) setResearchData(await res.json());
    } catch {
      console.error('Research request failed');
    } finally {
      setLoading(false);
    }
  }, [basePath, researchCity, researchCategory]);

  // Sorting
  const citySort = useSort(cityData?.cities || null, 'demandScore');
  const categorySort = useSort(categoryData?.categories || null, 'searchVolume');
  const oppSort = useSort(opportunityData?.opportunities || null, 'opportunityScore');

  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);

  const handleCollectTrends = useCallback(async () => {
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch(`${basePath}/api/analytics/demand-discovery/global-demand`, {
        method: 'POST',
      });
      const result = await res.json();
      setCollectMsg(result.message || result.error);
      setTimeout(() => {
        setLoadedTabs((prev) => {
          const next = new Set(prev);
          next.delete('global');
          return next;
        });
        fetchTabData('global');
      }, 5000);
    } catch {
      setCollectMsg('Failed to trigger collection');
    } finally {
      setCollecting(false);
    }
  }, [basePath, fetchTabData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/analytics" className="hover:text-sky-600">
            Analytics
          </Link>
          <span>/</span>
          <span>Demand Discovery</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Demand Discovery</h1>
        <p className="text-slate-500 mt-1">
          Find where demand is highest and identify untapped bidding opportunities
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {/* Error display */}
      {tabError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">Error loading data</p>
          <p className="text-sm text-red-600 mt-1">{tabError}</p>
          <button
            onClick={() => {
              setTabError(null);
              setLoadedTabs((prev) => {
                const next = new Set(prev);
                next.delete(activeTab);
                return next;
              });
              fetchTabData(activeTab);
            }}
            className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !globalData && !cityData && !categoryData && !opportunityData && !trendingData ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ================================================================ */}
          {/* GLOBAL DEMAND TAB */}
          {/* ================================================================ */}
          {activeTab === 'global' && (
            <>
              {/* Collect Trends button */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">Google Trends Data</h2>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {globalData?.totals.lastTrendCollection
                          ? `Last collected: ${globalData.totals.lastTrendCollection}`
                          : 'No trend data yet. Click to fetch from Google Trends via DataForSEO.'}
                      </p>
                    </div>
                    <button
                      onClick={handleCollectTrends}
                      disabled={collecting}
                      className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                    >
                      {collecting ? 'Collecting...' : 'Collect Trends Now'}
                    </button>
                  </div>
                  {collectMsg && (
                    <p className="mt-2 text-sm text-sky-700 bg-sky-50 rounded px-3 py-2">
                      {collectMsg}
                    </p>
                  )}
                </CardContent>
              </Card>

              {globalData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MetricCard
                    title="Experience Categories"
                    value={globalData.totals.totalCategories}
                  />
                  <MetricCard
                    title="Products Available"
                    value={
                      ((globalData.totals as Record<string, unknown>)['totalProducts'] as number) ||
                      0
                    }
                  />
                  <MetricCard
                    title="Destinations"
                    value={
                      ((globalData.totals as Record<string, unknown>)[
                        'totalLocations'
                      ] as number) || 0
                    }
                  />
                  <MetricCard
                    title="Search Volume Data"
                    value={
                      globalData.totals.totalSearchVolume > 0
                        ? globalData.totals.totalSearchVolume
                        : 'Pending'
                    }
                  />
                </div>
              )}

              {/* Google Trends Data Table */}
              {globalData && globalData.googleTrends && globalData.googleTrends.length > 0 && (
                <Card>
                  <div className="p-4 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900">
                      Google Trends: Experience Category Interest
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Real-time trend scores (0-100) across 10 tourism markets
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Category
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Trend Score
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Direction
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Search Volume
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            CPC
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Demand Score
                          </th>
                          <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Top Markets
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {globalData.googleTrends.map((t) => (
                          <tr key={t.category} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {t.category}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                              {t.avgTrendScore}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  t.direction === 'breakout'
                                    ? 'bg-purple-100 text-purple-700'
                                    : t.direction === 'rising'
                                      ? 'bg-green-100 text-green-700'
                                      : t.direction === 'declining'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {t.direction.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {t.totalSearchVolume.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {t.avgCpc > 0 ? `£${t.avgCpc.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  t.demandScore >= 70
                                    ? 'bg-green-100 text-green-700'
                                    : t.demandScore >= 40
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {t.demandScore}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {t.topLocations.map((l) => l.location).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Top Categories by Product Availability + Search Volume */}
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">
                    Global Experience Demand by Category
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Experience types ranked by product availability and search demand
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Category
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Products
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Cities
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Avg Price
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Search Vol
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          CPC
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Top Destinations
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(globalData?.categories || []).slice(0, 40).map((cat) => {
                        const c = cat as unknown as Record<string, unknown>;
                        return (
                          <tr key={cat.category} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-slate-900">
                                {cat.category}
                              </span>
                              {cat.topKeywords.length > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {cat.topKeywords
                                    .slice(0, 2)
                                    .map((k) => k.keyword)
                                    .join(', ')}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                              {(c['productCount'] as number) || '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {(c['cityCount'] as number) || '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {(c['avgPrice'] as number) ? `£${c['avgPrice']}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {cat.totalSearchVolume > 0
                                ? cat.totalSearchVolume.toLocaleString()
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {cat.avgCpc > 0 ? `£${cat.avgCpc.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {cat.topLocations
                                .slice(0, 3)
                                .map((l) => l.location)
                                .join(', ') || '-'}
                            </td>
                          </tr>
                        );
                      })}
                      {(!globalData?.categories || globalData.categories.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            No product data available. Ensure products are synced from Holibob.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Top Destinations */}
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">Where Is Demand Strongest?</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Destinations ranked by product availability and search demand
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Destination
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Products
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Categories
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Search Vol
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Top Experience Types
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(globalData?.topLocations || []).map((loc) => {
                        const l = loc as unknown as Record<string, unknown>;
                        return (
                          <tr key={loc.location} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {loc.location}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                              {(l['productCount'] as number) || '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {loc.categoryCount}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {loc.totalSearchVolume > 0
                                ? loc.totalSearchVolume.toLocaleString()
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {loc.topCategories.slice(0, 4).join(', ')}
                            </td>
                          </tr>
                        );
                      })}
                      {(!globalData?.topLocations || globalData.topLocations.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No destination data. Ensure products are synced from Holibob with city
                            data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Rising Experience Queries */}
              {globalData && globalData.risingQueries.length > 0 && (
                <Card>
                  <div className="p-4 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900">Rising Experience Searches</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Tour and experience queries growing in search visibility (30d vs prior 30d)
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Query
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Impressions
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Growth
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Clicks
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {globalData.risingQueries.map((q, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-900">{q.query}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {q.currentImpressions.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <TrendIndicator value={q.growth} />
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {q.clicks.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Top Keywords per Category (expandable) */}
              {globalData &&
                globalData.categories.slice(0, 5).map((cat) => (
                  <Card key={cat.category}>
                    <div className="p-4 border-b border-slate-200">
                      <h2 className="font-semibold text-slate-900">Top Keywords: {cat.category}</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Keyword
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Monthly Volume
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              CPC
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cat.topKeywords.map((kw, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-sm text-slate-900">{kw.keyword}</td>
                              <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                                {kw.volume.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                £{kw.cpc.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
            </>
          )}

          {/* ================================================================ */}
          {/* CITIES TAB */}
          {/* ================================================================ */}
          {activeTab === 'cities' && (
            <>
              {cityData && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <MetricCard title="Cities" value={cityData.totals.cities} />
                  <MetricCard title="Total Search Volume" value={cityData.totals.totalVolume} />
                  <MetricCard
                    title="Total Revenue (30d)"
                    value={cityData.totals.totalRevenue}
                    format="currency"
                  />
                </div>
              )}
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">City Demand Ranking</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Cities ranked by combined search volume, GSC performance, and revenue signals
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <SortableHeader
                          label="City"
                          field="city"
                          align="left"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Products"
                          field="productCount"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Categories"
                          field="categoryCount"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Search Vol"
                          field="searchVolume"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Avg CPC"
                          field="avgCpc"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="GSC Clicks"
                          field="gscClicks"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Revenue"
                          field="revenue"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Campaigns"
                          field="activeCampaigns"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                        <SortableHeader
                          label="Score"
                          field="demandScore"
                          currentSort={citySort.sortField}
                          currentDirection={citySort.sortDirection}
                          onSort={citySort.handleSort}
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(citySort.sorted || []).slice(0, 50).map((city) => (
                        <tr key={city.city} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-slate-900">{city.city}</span>
                            <p className="text-xs text-slate-400">
                              {city.topCategories.slice(0, 3).join(', ')}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.productCount}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.categoryCount}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.searchVolume.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.avgCpc > 0 ? `£${city.avgCpc.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.gscClicks.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.revenue > 0 ? `£${city.revenue.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {city.activeCampaigns || '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DemandScoreBadge score={city.demandScore} />
                          </td>
                        </tr>
                      ))}
                      {(!citySort.sorted || citySort.sorted.length === 0) && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                            No city data available. Ensure products have cities assigned.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* ================================================================ */}
          {/* CATEGORIES TAB */}
          {/* ================================================================ */}
          {activeTab === 'categories' && (
            <>
              {categoryData && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <MetricCard title="Categories" value={categoryData.totals.categories} />
                  <MetricCard title="Total Search Volume" value={categoryData.totals.totalVolume} />
                  <MetricCard
                    title="Total Revenue (30d)"
                    value={categoryData.totals.totalRevenue}
                    format="currency"
                  />
                </div>
              )}
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">Category Demand</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Experience categories ranked by search demand
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <SortableHeader
                          label="Category"
                          field="category"
                          align="left"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Products"
                          field="productCount"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Cities"
                          field="cityCount"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Search Vol"
                          field="searchVolume"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Avg CPC"
                          field="avgCpc"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Avg Price"
                          field="avgPrice"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Revenue"
                          field="revenue"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                        <SortableHeader
                          label="Campaigns"
                          field="activeCampaigns"
                          currentSort={categorySort.sortField}
                          currentDirection={categorySort.sortDirection}
                          onSort={categorySort.handleSort}
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(categorySort.sorted || []).slice(0, 50).map((cat) => (
                        <tr key={cat.category} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-slate-900">
                              {cat.category}
                            </span>
                            <p className="text-xs text-slate-400">
                              {cat.topCities.slice(0, 3).join(', ')}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.productCount}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.cityCount}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.searchVolume.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.avgCpc > 0 ? `£${cat.avgCpc.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.avgPrice > 0 ? `£${cat.avgPrice}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.revenue > 0 ? `£${cat.revenue.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {cat.activeCampaigns || '-'}
                          </td>
                        </tr>
                      ))}
                      {(!categorySort.sorted || categorySort.sorted.length === 0) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                            No category data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* ================================================================ */}
          {/* OPPORTUNITIES TAB */}
          {/* ================================================================ */}
          {activeTab === 'opportunities' && (
            <>
              {opportunityData && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricCard title="Total Opportunities" value={opportunityData.totals.total} />
                    <MetricCard
                      title="Uncovered (Score 50+)"
                      value={opportunityData.totals.uncoveredHighValue}
                    />
                    <MetricCard
                      title="Avg Predicted ROAS"
                      value={`${opportunityData.totals.avgPredictedRoas}x`}
                    />
                    <MetricCard
                      title="Assumed AOV"
                      value={opportunityData.assumptions.aov}
                      format="currency"
                      subtitle={`CVR: ${opportunityData.assumptions.cvr}%, Comm: ${opportunityData.assumptions.commissionRate}%`}
                    />
                  </div>
                </>
              )}
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        City x Category Opportunities
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Ranked by predicted ROAS. Uncovered = no active campaign.
                      </p>
                    </div>
                    <Link
                      href="/operations/bidding"
                      className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                    >
                      Go to Bidding Engine →
                    </Link>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <SortableHeader
                          label="City"
                          field="city"
                          align="left"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="Category"
                          field="category"
                          align="left"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="Products"
                          field="productCount"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="Search Vol"
                          field="searchVolume"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="CPC"
                          field="cpc"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="Intent"
                          field="intent"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="Predicted ROAS"
                          field="predictedRoas"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <SortableHeader
                          label="Score"
                          field="opportunityScore"
                          currentSort={oppSort.sortField}
                          currentDirection={oppSort.sortDirection}
                          onSort={oppSort.handleSort}
                        />
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Campaign
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(oppSort.sorted || []).slice(0, 100).map((opp, i) => (
                        <tr
                          key={`${opp.city}-${opp.category}-${i}`}
                          className={`hover:bg-slate-50 ${!opp.hasCampaign && opp.opportunityScore >= 50 ? 'bg-amber-50/50' : ''}`}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {opp.city}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">{opp.category}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {opp.productCount}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {opp.searchVolume.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {opp.cpc > 0 ? `£${opp.cpc.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <IntentBadge intent={opp.intent} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {opp.predictedRoas > 0 ? (
                              <RoasBadge roas={opp.predictedRoas} />
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DemandScoreBadge score={opp.opportunityScore} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <CampaignBadge
                              hasCampaign={opp.hasCampaign}
                              status={opp.campaignStatus}
                            />
                          </td>
                        </tr>
                      ))}
                      {(!oppSort.sorted || oppSort.sorted.length === 0) && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                            No opportunity data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* ================================================================ */}
          {/* TRENDING TAB */}
          {/* ================================================================ */}
          {activeTab === 'trending' && (
            <>
              {trendingData && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <MetricCard title="Rising Queries" value={trendingData.totals.risingCount} />
                  <MetricCard title="Breakout Queries" value={trendingData.totals.breakoutCount} />
                  <MetricCard
                    title="Declining Queries"
                    value={trendingData.totals.decliningCount}
                  />
                </div>
              )}

              {/* Breakouts */}
              {trendingData && trendingData.breakouts.length > 0 && (
                <Card>
                  <div className="p-4 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900">Breakout Queries</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      New or rapidly emerging search queries (low/no prior visibility → significant
                      impressions now)
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Query
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Current Impressions
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Prior Impressions
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Clicks
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Type
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trendingData.breakouts.map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50 bg-green-50/30">
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-slate-900">
                                {item.query}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {item.currentImpressions.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-400">
                              {item.priorImpressions.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {item.currentClicks.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${item.isNew ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}
                              >
                                {item.isNew ? 'NEW' : 'BREAKOUT'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Rising */}
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">Rising Queries</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Queries with &gt;20% impression growth (last 30d vs prior 30d)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Query
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Impressions
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Change
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Clicks
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                          Click Change
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(trendingData?.rising || []).map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-900">{item.query}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {item.currentImpressions.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <TrendIndicator value={item.impressionChange} />
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">
                            {item.currentClicks.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <TrendIndicator value={item.clickChange} />
                          </td>
                        </tr>
                      ))}
                      {(!trendingData?.rising || trendingData.rising.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No rising queries detected in the current period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Declining */}
              {trendingData && trendingData.declining.length > 0 && (
                <Card>
                  <div className="p-4 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900">Declining Queries</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Queries with &gt;20% impression decline — consider reducing bids
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Query
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Current
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Prior
                          </th>
                          <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trendingData.declining.slice(0, 20).map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-900">{item.query}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {item.currentImpressions.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-400">
                              {item.priorImpressions.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <TrendIndicator value={item.impressionChange} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ================================================================ */}
          {/* RESEARCH TAB */}
          {/* ================================================================ */}
          {activeTab === 'research' && (
            <>
              <Card>
                <div className="p-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">Keyword Research</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Enter a city and/or category to research keyword opportunities
                  </p>
                </div>
                <CardContent className="p-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={researchCity}
                        onChange={(e) => setResearchCity(e.target.value)}
                        placeholder="e.g. Barcelona, London, Rome"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Category
                      </label>
                      <input
                        type="text"
                        value={researchCategory}
                        onChange={(e) => setResearchCategory(e.target.value)}
                        placeholder="e.g. food tours, walking tours, cooking class"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <button
                      onClick={handleResearch}
                      disabled={loading || (!researchCity && !researchCategory)}
                      className="px-6 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Researching...' : 'Research'}
                    </button>
                  </div>
                </CardContent>
              </Card>

              {researchData && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricCard title="Keywords Found" value={researchData.summary.totalKeywords} />
                    <MetricCard
                      title="Total Search Volume"
                      value={researchData.summary.totalSearchVolume}
                    />
                    <MetricCard
                      title="Avg CPC"
                      value={researchData.summary.avgCpc}
                      format="currency"
                    />
                    <MetricCard
                      title="Matching Products"
                      value={researchData.summary.matchingProducts}
                      subtitle={
                        researchData.summary.avgProductPrice > 0
                          ? `Avg price: £${researchData.summary.avgProductPrice}`
                          : undefined
                      }
                    />
                  </div>

                  {/* Keywords table */}
                  <Card>
                    <div className="p-4 border-b border-slate-200">
                      <h2 className="font-semibold text-slate-900">
                        Keywords for{' '}
                        {[researchData.query.category, researchData.query.city]
                          .filter(Boolean)
                          .join(' in ')}
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Keyword
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Volume
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              CPC
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Difficulty
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Intent
                            </th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {researchData.keywords.slice(0, 30).map((kw, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-sm text-slate-900">{kw.keyword}</td>
                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                {kw.searchVolume.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                £{kw.cpc.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <DemandScoreBadge score={kw.difficulty} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <IntentBadge intent={kw.intent} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                  {kw.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {researchData.keywords.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                No keywords found. Try a different city or category.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* GSC Performance for search terms */}
                  {researchData.gscPerformance.length > 0 && (
                    <Card>
                      <div className="p-4 border-b border-slate-200">
                        <h2 className="font-semibold text-slate-900">GSC Performance</h2>
                        <p className="text-sm text-slate-500 mt-1">
                          How related search terms are performing organically
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Term
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Clicks
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Impressions
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Avg Position
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {researchData.gscPerformance.map((item, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-sm text-slate-900">{item.term}</td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {item.clicks.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {item.impressions.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {item.avgPosition.toFixed(1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {/* Matching products */}
                  {researchData.products.length > 0 && (
                    <Card>
                      <div className="p-4 border-b border-slate-200">
                        <h2 className="font-semibold text-slate-900">
                          Matching Products ({researchData.products.length})
                        </h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Product
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                City
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Price
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Rating
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Bookings
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {researchData.products.map((p, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-4 py-3">
                                  <span className="text-sm text-slate-900 block truncate max-w-xs">
                                    {p.title}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {p.categories.slice(0, 3).join(', ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {p.city || '-'}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {p.price > 0 ? `£${p.price.toFixed(0)}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {p.rating ? p.rating.toFixed(1) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {p.bookings}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {/* Existing campaigns */}
                  {researchData.campaigns.length > 0 && (
                    <Card>
                      <div className="p-4 border-b border-slate-200">
                        <h2 className="font-semibold text-slate-900">
                          Existing Campaigns ({researchData.campaigns.length})
                        </h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Campaign
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Platform
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Status
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                Spend
                              </th>
                              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                                ROAS
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {researchData.campaigns.map((c, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-4 py-3">
                                  <span className="text-sm text-slate-900 block truncate max-w-xs">
                                    {c.name}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {c.keywords.slice(0, 3).join(', ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  {c.platform}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <CampaignBadge hasCampaign={true} status={c.status} />
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-700">
                                  £{c.totalSpend.toFixed(0)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {c.roas ? <RoasBadge roas={c.roas} /> : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Loading indicator for tab refresh */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-slate-100 z-50">
          <div className="h-full w-1/3 bg-sky-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}
