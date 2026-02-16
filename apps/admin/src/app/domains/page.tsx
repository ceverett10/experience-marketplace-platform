'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Domain {
  id: string;
  domain: string;
  status:
    | 'PENDING'
    | 'AVAILABLE'
    | 'NOT_AVAILABLE'
    | 'REGISTERING'
    | 'DNS_PENDING'
    | 'SSL_PENDING'
    | 'ACTIVE'
    | 'EXPIRED'
    | 'FAILED';
  registrar: string;
  registeredAt: string | null;
  expiresAt: string | null;
  sslEnabled: boolean;
  sslExpiresAt: string | null;
  dnsConfigured: boolean;
  cloudflareZoneId: string | null;
  autoRenew: boolean;
  registrationCost: number;
  estimatedPrice?: number;
  siteName: string | null;
  siteId: string | null;
  isSuggested?: boolean;
  isOrphan?: boolean;
}

interface Stats {
  total: number;
  active: number;
  pending: number;
  available: number;
  notAvailable: number;
  orphan: number;
  sslEnabled: number;
  expiringBoon: number;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

const DOMAIN_PAGE_SIZE = 50;

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    pending: 0,
    available: 0,
    notAvailable: 0,
    orphan: 0,
    sslEnabled: 0,
    expiringBoon: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);
  const [creatingSiteForDomainId, setCreatingSiteForDomainId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo>({
    page: 1,
    pageSize: DOMAIN_PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input
  useEffect(() => {
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  // Fetch domains from API
  const fetchDomains = useCallback(async () => {
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const params = new URLSearchParams({
        status: statusFilter,
        page: currentPage.toString(),
        pageSize: DOMAIN_PAGE_SIZE.toString(),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const response = await fetch(`${basePath}/api/domains?${params}`);
      const data = await response.json();
      setDomains(data.domains || []);
      setPaginationInfo(
        data.pagination || { page: 1, pageSize: DOMAIN_PAGE_SIZE, totalCount: 0, totalPages: 1 }
      );
      setStats(
        data.stats || {
          total: 0,
          active: 0,
          pending: 0,
          available: 0,
          notAvailable: 0,
          orphan: 0,
          sslEnabled: 0,
          expiringBoon: 0,
        }
      );
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage, debouncedSearch]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const getStatusBadge = (status: Domain['status']) => {
    const styles: Record<Domain['status'], string> = {
      PENDING: 'bg-gray-100 text-gray-800',
      AVAILABLE: 'bg-emerald-100 text-emerald-800',
      NOT_AVAILABLE: 'bg-rose-100 text-rose-800',
      REGISTERING: 'bg-blue-100 text-blue-800 animate-pulse',
      DNS_PENDING: 'bg-amber-100 text-amber-800',
      SSL_PENDING: 'bg-amber-100 text-amber-800',
      ACTIVE: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-red-100 text-red-800',
      FAILED: 'bg-red-100 text-red-800',
    };
    const labels: Record<Domain['status'], string> = {
      PENDING: 'Pending Check',
      AVAILABLE: 'Available for Purchase',
      NOT_AVAILABLE: 'Not Available',
      REGISTERING: 'Registering...',
      DNS_PENDING: 'DNS Pending',
      SSL_PENDING: 'SSL Pending',
      ACTIVE: 'Active',
      EXPIRED: 'Expired',
      FAILED: 'Failed',
    };
    return (
      <span className={`${styles[status]} text-xs px-2 py-1 rounded font-medium`}>
        {labels[status]}
      </span>
    );
  };

  const getDaysUntilExpiry = (expiresAt: string | null): number | null => {
    if (!expiresAt) return null;
    return Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryColor = (days: number | null) => {
    if (days === null) return 'text-gray-500';
    if (days < 7) return 'text-red-600';
    if (days < 30) return 'text-amber-600';
    return 'text-green-600';
  };

  // Helper to refetch after actions
  const refetchDomains = () => fetchDomains();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domain Management</h1>
          <p className="text-slate-500 mt-1">Monitor domain registration, DNS, and SSL status</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setCheckingAvailability(true);
              try {
                const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
                const response = await fetch(`${basePath}/api/domains`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'checkAvailability' }),
                });
                const result = await response.json();
                if (response.ok) {
                  alert(
                    `Checked ${result.checked || 0} domains: ${result.available || 0} available, ${result.notAvailable || 0} not available`
                  );
                  await refetchDomains();
                } else {
                  alert(result.error || 'Failed to check availability');
                }
              } catch (error) {
                console.error('Failed to check availability:', error);
                alert('Failed to check availability');
              } finally {
                setCheckingAvailability(false);
              }
            }}
            disabled={checkingAvailability}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {checkingAvailability ? 'Checking...' : 'Check Availability'}
          </button>
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
                const response = await fetch(`${basePath}/api/domains`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'syncFromCloudflare' }),
                });
                const result = await response.json();
                if (response.ok) {
                  const unmatchedInfo = result.unmatched?.length
                    ? `\n\nUnmatched domains (${result.unmatched.length}):\n${result.unmatched.map((u: any) => `  ${u.domain} → slug "${u.extractedSlug}" (normalized: "${u.normalizedSlug}")`).join('\n')}`
                    : '';
                  const slugsInfo = result.availableSlugs?.length
                    ? `\n\nAvailable site slugs (${result.availableSlugs.length}):\n${result.availableSlugs.join(', ')}`
                    : '\n\nNo sites found in database.';
                  console.log('Cloudflare sync result:', JSON.stringify(result, null, 2));
                  alert(
                    `Fetched ${result.totalFromCloudflare || '?'} domains from Cloudflare.\nSynced: ${result.synced?.length || 0}\nDNS configured: ${result.dnsConfigured?.length || 0}${unmatchedInfo}${slugsInfo}`
                  );
                  await refetchDomains();
                } else {
                  alert(result.error || 'Failed to sync from Cloudflare');
                }
              } catch (error) {
                console.error('Failed to sync from Cloudflare:', error);
                alert('Failed to sync from Cloudflare');
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync from Cloudflare'}
          </button>
          <button
            onClick={async () => {
              setQueueing(true);
              try {
                const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
                const response = await fetch(`${basePath}/api/domains`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'queueMissing' }),
                });
                const result = await response.json();
                if (response.ok) {
                  alert(`Queued domain registration for ${result.queued?.length || 0} sites`);
                  await refetchDomains();
                } else {
                  alert(result.error || 'Failed to queue domains');
                }
              } catch (error) {
                console.error('Failed to queue domains:', error);
                alert('Failed to queue domains');
              } finally {
                setQueueing(false);
              }
            }}
            disabled={queueing}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {queueing ? 'Queueing...' : 'Queue Missing Domains'}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setStatusFilter('ACTIVE');
            setCurrentPage(1);
          }}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-sm text-slate-500">Active</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setStatusFilter('AVAILABLE');
            setCurrentPage(1);
          }}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-600">{stats.available}</p>
            <p className="text-sm text-slate-500">Available</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setStatusFilter('NOT_AVAILABLE');
            setCurrentPage(1);
          }}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-rose-600">{stats.notAvailable}</p>
            <p className="text-sm text-slate-500">Unavailable</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setStatusFilter('PENDING');
            setCurrentPage(1);
          }}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-sm text-slate-500">Pending</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-orange-600">{stats.orphan}</p>
            <p className="text-sm text-slate-500">No Site</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.sslEnabled}</p>
            <p className="text-sm text-slate-500">SSL</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{stats.expiringBoon}</p>
            <p className="text-sm text-slate-500">Expiring</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search domains or sites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="PENDING">Pending Check</option>
          <option value="AVAILABLE">Available for Purchase</option>
          <option value="NOT_AVAILABLE">Not Available</option>
          <option value="ACTIVE">Active</option>
          <option value="REGISTERING">Registering</option>
          <option value="DNS_PENDING">DNS Pending</option>
          <option value="SSL_PENDING">SSL Pending</option>
          <option value="EXPIRED">Expired</option>
          <option value="FAILED">Failed</option>
        </select>
        {loading && <span className="text-sm text-slate-400">Loading...</span>}
      </div>

      {/* Domains list */}
      <div className="space-y-4">
        {domains.map((domain) => {
          const daysUntilExpiry = getDaysUntilExpiry(domain.expiresAt);
          const sslDaysUntilExpiry = getDaysUntilExpiry(domain.sslExpiresAt);

          return (
            <Card key={domain.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900">{domain.domain}</h3>
                      {getStatusBadge(domain.status)}
                      {domain.isSuggested && (
                        <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium">
                          Suggested
                        </span>
                      )}
                      {domain.isOrphan && (
                        <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded font-medium">
                          No Site
                        </span>
                      )}
                    </div>
                    {domain.siteName && (
                      <p className="text-sm text-slate-600">Site: {domain.siteName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.sslEnabled && (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        🔒 SSL
                      </span>
                    )}
                    {domain.dnsConfigured && (
                      <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        ☁️ Cloudflare
                      </span>
                    )}
                    {domain.autoRenew && (
                      <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                        ♻️ Auto-renew
                      </span>
                    )}
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Registrar</div>
                    <div className="text-sm font-medium text-slate-900 capitalize">
                      {domain.registrar}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Registration</div>
                    <div className="text-sm font-medium text-slate-900">
                      {domain.registeredAt
                        ? new Date(domain.registeredAt).toLocaleDateString()
                        : 'Pending'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Domain Expires</div>
                    <div className={`text-sm font-medium ${getExpiryColor(daysUntilExpiry)}`}>
                      {daysUntilExpiry !== null ? `${daysUntilExpiry} days` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">SSL Expires</div>
                    <div className={`text-sm font-medium ${getExpiryColor(sslDaysUntilExpiry)}`}>
                      {sslDaysUntilExpiry !== null ? `${sslDaysUntilExpiry} days` : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Progress indicator for pending domains */}
                {domain.status !== 'ACTIVE' && domain.status !== 'EXPIRED' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-900">Setup Progress</span>
                      <span className="text-xs text-blue-700">
                        {domain.status === 'REGISTERING' && 'Step 1/3'}
                        {domain.status === 'DNS_PENDING' && 'Step 2/3'}
                        {domain.status === 'SSL_PENDING' && 'Step 3/3'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{
                            width:
                              domain.status === 'REGISTERING'
                                ? '33%'
                                : domain.status === 'DNS_PENDING'
                                  ? '66%'
                                  : '95%',
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-blue-700">
                      {domain.status === 'REGISTERING' && '⏳ Registering domain with Namecheap...'}
                      {domain.status === 'DNS_PENDING' && '⏳ Configuring DNS with Cloudflare...'}
                      {domain.status === 'SSL_PENDING' && '⏳ Provisioning SSL certificate...'}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    {domain.estimatedPrice
                      ? `Est. $${domain.estimatedPrice}/year`
                      : domain.registrationCost
                        ? `Cost: $${domain.registrationCost}/year`
                        : 'Price: Check availability'}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Check availability button for pending domains */}
                    {domain.status === 'PENDING' && (
                      <button
                        onClick={async () => {
                          setCheckingDomainId(domain.id);
                          try {
                            const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
                            const response = await fetch(`${basePath}/api/domains`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'checkSingleAvailability',
                                domain: domain.domain,
                                domainId: domain.id,
                              }),
                            });
                            const result = await response.json();
                            if (response.ok) {
                              await refetchDomains();
                            } else {
                              alert(result.error || 'Failed to check availability');
                            }
                          } catch (error) {
                            console.error('Failed to check availability:', error);
                            alert('Failed to check availability');
                          } finally {
                            setCheckingDomainId(null);
                          }
                        }}
                        disabled={checkingDomainId === domain.id}
                        className="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {checkingDomainId === domain.id ? 'Checking...' : 'Check Availability'}
                      </button>
                    )}
                    {/* Purchase button for available domains */}
                    {domain.status === 'AVAILABLE' && (
                      <button
                        onClick={async () => {
                          if (
                            !confirm(
                              `Register ${domain.domain} for ~$${domain.estimatedPrice || 10}/year?`
                            )
                          )
                            return;
                          try {
                            const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
                            const response = await fetch(`${basePath}/api/domains`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                domain: domain.domain,
                                siteId: domain.siteId,
                                registrar: 'cloudflare',
                              }),
                            });
                            const result = await response.json();
                            if (response.ok) {
                              alert('Domain registration queued!');
                              await refetchDomains();
                            } else {
                              alert(result.error || 'Failed to register domain');
                            }
                          } catch (error) {
                            console.error('Failed to register domain:', error);
                            alert('Failed to register domain');
                          }
                        }}
                        className="px-3 py-1.5 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors"
                      >
                        Purchase Domain
                      </button>
                    )}
                    {/* Unavailable notice */}
                    {domain.status === 'NOT_AVAILABLE' && (
                      <span className="px-3 py-1.5 text-sm text-rose-600 bg-rose-50 rounded-lg">
                        Domain taken
                      </span>
                    )}
                    {/* Create Site button for orphan domains */}
                    {domain.isOrphan && (
                      <button
                        onClick={async () => {
                          setCreatingSiteForDomainId(domain.id);
                          try {
                            const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
                            const response = await fetch(`${basePath}/api/domains`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'createSiteFromDomain',
                                domainId: domain.id,
                              }),
                            });
                            const result = await response.json();
                            if (response.ok) {
                              const roadmapInfo = result.roadmap?.queued?.length
                                ? `\nPipeline started: ${result.roadmap.queued.length} task(s) queued.`
                                : '';
                              alert(
                                `Site "${result.site.name}" ${result.action === 'linked' ? 'linked' : 'created'} for ${result.domain}${roadmapInfo}`
                              );
                              await refetchDomains();
                            } else {
                              alert(result.error || 'Failed to create site');
                            }
                          } catch (error) {
                            console.error('Failed to create site:', error);
                            alert('Failed to create site');
                          } finally {
                            setCreatingSiteForDomainId(null);
                          }
                        }}
                        disabled={creatingSiteForDomainId === domain.id}
                        className="px-3 py-1.5 text-sm bg-orange-600 text-white hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {creatingSiteForDomainId === domain.id ? 'Creating...' : 'Create Site'}
                      </button>
                    )}
                    {/* Active domain actions */}
                    {domain.status === 'ACTIVE' && !domain.isOrphan && (
                      <>
                        <button className="px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                          View DNS
                        </button>
                        <a
                          href={`https://${domain.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                        >
                          Visit Site →
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Pagination controls */}
      {paginationInfo.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(currentPage - 1) * DOMAIN_PAGE_SIZE + 1}-
            {Math.min(currentPage * DOMAIN_PAGE_SIZE, paginationInfo.totalCount)} of{' '}
            {paginationInfo.totalCount} domains
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, paginationInfo.totalPages) }, (_, i) => {
              let pageNum: number;
              if (paginationInfo.totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= paginationInfo.totalPages - 2) {
                pageNum = paginationInfo.totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${currentPage === pageNum ? 'bg-sky-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(paginationInfo.totalPages, p + 1))}
              disabled={currentPage === paginationInfo.totalPages}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {domains.length === 0 && !loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-lg font-medium text-slate-900">No domains found</h3>
            <p className="text-slate-500 mt-1">
              Try adjusting your filters or register a new domain
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
