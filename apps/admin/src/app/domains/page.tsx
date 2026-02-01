'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Domain {
  id: string;
  domain: string;
  status: 'PENDING' | 'REGISTERING' | 'DNS_PENDING' | 'SSL_PENDING' | 'ACTIVE' | 'EXPIRED' | 'FAILED';
  registrar: string;
  registeredAt: string | null;
  expiresAt: string | null;
  sslEnabled: boolean;
  sslExpiresAt: string | null;
  dnsConfigured: boolean;
  cloudflareZoneId: string | null;
  autoRenew: boolean;
  registrationCost: number;
  siteName: string | null;
}

// Mock data - in production, fetch from API
const mockDomains: Domain[] = [
  {
    id: '1',
    domain: 'london-food-tours.com',
    status: 'ACTIVE',
    registrar: 'namecheap',
    registeredAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 358 * 86400000).toISOString(),
    sslEnabled: true,
    sslExpiresAt: new Date(Date.now() + 85 * 86400000).toISOString(),
    dnsConfigured: true,
    cloudflareZoneId: 'zone-abc123',
    autoRenew: true,
    registrationCost: 12.99,
    siteName: 'London Food Tours',
  },
  {
    id: '2',
    domain: 'paris-walking-tours.com',
    status: 'SSL_PENDING',
    registrar: 'namecheap',
    registeredAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 364 * 86400000).toISOString(),
    sslEnabled: false,
    sslExpiresAt: null,
    dnsConfigured: true,
    cloudflareZoneId: 'zone-def456',
    autoRenew: true,
    registrationCost: 12.99,
    siteName: 'Paris Walking Tours',
  },
  {
    id: '3',
    domain: 'barcelona-wine-tours.com',
    status: 'REGISTERING',
    registrar: 'namecheap',
    registeredAt: null,
    expiresAt: null,
    sslEnabled: false,
    sslExpiresAt: null,
    dnsConfigured: false,
    cloudflareZoneId: null,
    autoRenew: true,
    registrationCost: 12.99,
    siteName: 'Barcelona Wine Tours',
  },
];

export default function DomainsPage() {
  const [domains] = useState<Domain[]>(mockDomains);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredDomains = domains.filter(
    (domain) => statusFilter === 'all' || domain.status === statusFilter
  );

  const stats = {
    total: domains.length,
    active: domains.filter((d) => d.status === 'ACTIVE').length,
    pending: domains.filter((d) =>
      ['REGISTERING', 'DNS_PENDING', 'SSL_PENDING'].includes(d.status)
    ).length,
    sslEnabled: domains.filter((d) => d.sslEnabled).length,
    expiringBoon: domains.filter((d) => {
      if (!d.expiresAt) return false;
      const daysUntilExpiry = Math.floor(
        (new Date(d.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiry < 30;
    }).length,
  };

  const getStatusBadge = (status: Domain['status']) => {
    const styles = {
      PENDING: 'bg-gray-100 text-gray-800',
      REGISTERING: 'bg-blue-100 text-blue-800 animate-pulse',
      DNS_PENDING: 'bg-amber-100 text-amber-800',
      SSL_PENDING: 'bg-amber-100 text-amber-800',
      ACTIVE: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-red-100 text-red-800',
      FAILED: 'bg-red-100 text-red-800',
    };
    const labels = {
      PENDING: 'Pending',
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domain Management</h1>
          <p className="text-slate-500 mt-1">
            Monitor domain registration, DNS, and SSL status
          </p>
        </div>
        <button className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors">
          Register Domain
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total Domains</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-sm text-slate-500">Active</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-sm text-slate-500">Pending</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.sslEnabled}</p>
            <p className="text-sm text-slate-500">SSL Enabled</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{stats.expiringBoon}</p>
            <p className="text-sm text-slate-500">Expiring Soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="REGISTERING">Registering</option>
          <option value="DNS_PENDING">DNS Pending</option>
          <option value="SSL_PENDING">SSL Pending</option>
          <option value="EXPIRED">Expired</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* Domains list */}
      <div className="space-y-4">
        {filteredDomains.map((domain) => {
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
                    <div
                      className={`text-sm font-medium ${getExpiryColor(daysUntilExpiry)}`}
                    >
                      {daysUntilExpiry !== null ? `${daysUntilExpiry} days` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">SSL Expires</div>
                    <div
                      className={`text-sm font-medium ${getExpiryColor(sslDaysUntilExpiry)}`}
                    >
                      {sslDaysUntilExpiry !== null ? `${sslDaysUntilExpiry} days` : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Progress indicator for pending domains */}
                {domain.status !== 'ACTIVE' && domain.status !== 'EXPIRED' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-900">
                        Setup Progress
                      </span>
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
                    Cost: ${domain.registrationCost}/year
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                      View DNS
                    </button>
                    <button className="px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                      Manage →
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredDomains.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-lg font-medium text-slate-900">No domains found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your filters or register a new domain</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
