'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@experience-marketplace/ui-components';

interface BacklinkItem {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string;
  domainAuthority: number;
  isDoFollow: boolean;
  isActive: boolean;
  acquisitionMethod: string;
  firstSeenAt: string;
  siteName: string;
}

interface OpportunityItem {
  id: string;
  targetDomain: string;
  targetUrl: string;
  domainAuthority: number;
  relevanceScore: number;
  priorityScore: number;
  opportunityType: string;
  status: string;
  hasOutreach: boolean;
  siteName: string;
  createdAt: string;
}

interface AssetItem {
  id: string;
  title: string;
  slug: string;
  assetType: string;
  backlinkCount: number;
  socialShares: number;
  siteName: string;
  createdAt: string;
}

interface LinkBuildingData {
  summary: {
    totalBacklinks: number;
    referringDomains: number;
    avgDA: number;
    totalOpportunities: number;
    totalAssets: number;
    pipeline: {
      identified: number;
      researched: number;
      outreachDrafted: number;
      outreachSent: number;
      responded: number;
      acquired: number;
      rejected: number;
    };
  };
  backlinks: BacklinkItem[];
  opportunities: OpportunityItem[];
  assets: AssetItem[];
}

export default function LinkBuildingPage() {
  const [data, setData] = useState<LinkBuildingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'backlinks' | 'opportunities' | 'assets'>('overview');
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/admin/api/link-building');
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError('Failed to load link building data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerAction = async (action: string, params: Record<string, unknown> = {}) => {
    try {
      setActionStatus('Processing...');
      // Use first available site as default
      const siteId = data?.backlinks[0]?.siteName || data?.opportunities[0]?.siteName || '';
      const response = await fetch('/admin/api/link-building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, siteId, ...params }),
      });
      const result = await response.json();
      setActionStatus(result.message || 'Action completed');
      setTimeout(() => setActionStatus(null), 3000);
      fetchData();
    } catch (err) {
      setActionStatus('Action failed');
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Link Building</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-lg" />
          <div className="h-64 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Link Building</h1>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error || 'No data available'}</div>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Link Building</h1>
        <div className="flex gap-2">
          {actionStatus && (
            <span className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg">{actionStatus}</span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Total Backlinks</p>
            <p className="text-2xl font-bold">{summary.totalBacklinks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Referring Domains</p>
            <p className="text-2xl font-bold">{summary.referringDomains}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Avg Domain Authority</p>
            <p className="text-2xl font-bold">{summary.avgDA}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Opportunities</p>
            <p className="text-2xl font-bold">{summary.totalOpportunities}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Linkable Assets</p>
            <p className="text-2xl font-bold">{summary.totalAssets}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Outreach Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {[
              { label: 'Identified', count: summary.pipeline.identified, color: 'bg-gray-100 text-gray-800' },
              { label: 'Researched', count: summary.pipeline.researched, color: 'bg-blue-100 text-blue-800' },
              { label: 'Drafted', count: summary.pipeline.outreachDrafted, color: 'bg-yellow-100 text-yellow-800' },
              { label: 'Sent', count: summary.pipeline.outreachSent, color: 'bg-orange-100 text-orange-800' },
              { label: 'Responded', count: summary.pipeline.responded, color: 'bg-purple-100 text-purple-800' },
              { label: 'Acquired', count: summary.pipeline.acquired, color: 'bg-green-100 text-green-800' },
            ].map((stage) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className={`px-3 py-2 rounded-lg text-center min-w-[100px] ${stage.color}`}>
                  <p className="text-lg font-bold">{stage.count}</p>
                  <p className="text-xs">{stage.label}</p>
                </div>
                <span className="text-gray-300 text-xl">&rarr;</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {(['overview', 'backlinks', 'opportunities', 'assets'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'backlinks' && (
        <Card>
          <CardHeader>
            <CardTitle>Backlinks ({data.backlinks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Source Domain</th>
                    <th className="text-left py-2 px-3">DA</th>
                    <th className="text-left py-2 px-3">Anchor Text</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">First Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.backlinks.map((bl) => (
                    <tr key={bl.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <a href={bl.sourceUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                          {bl.sourceDomain}
                        </a>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-medium ${bl.domainAuthority >= 40 ? 'text-green-600' : bl.domainAuthority >= 20 ? 'text-yellow-600' : 'text-gray-500'}`}>
                          {bl.domainAuthority}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-[200px] truncate">{bl.anchorText || '—'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${bl.isDoFollow ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {bl.isDoFollow ? 'DoFollow' : 'NoFollow'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${bl.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {bl.isActive ? 'Active' : 'Lost'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{new Date(bl.firstSeenAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.backlinks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No backlinks tracked yet. Run a backlink monitor to discover existing links.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'opportunities' && (
        <Card>
          <CardHeader>
            <CardTitle>Link Opportunities ({data.opportunities.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Domain</th>
                    <th className="text-left py-2 px-3">DA</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Priority</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.opportunities.map((opp) => (
                    <tr key={opp.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <a href={opp.targetUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                          {opp.targetDomain}
                        </a>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-medium ${opp.domainAuthority >= 40 ? 'text-green-600' : opp.domainAuthority >= 20 ? 'text-yellow-600' : 'text-gray-500'}`}>
                          {opp.domainAuthority}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs">{opp.opportunityType.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-3">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${Math.round(opp.priorityScore * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          opp.status === 'LINK_ACQUIRED' ? 'bg-green-100 text-green-700' :
                          opp.status === 'OUTREACH_SENT' ? 'bg-orange-100 text-orange-700' :
                          opp.status === 'OUTREACH_DRAFTED' ? 'bg-yellow-100 text-yellow-700' :
                          opp.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {opp.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {!opp.hasOutreach && opp.status === 'IDENTIFIED' && (
                          <button
                            onClick={() => triggerAction('generate-outreach', {
                              opportunityId: opp.id,
                              templateType: 'resource_page',
                            })}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Generate Outreach
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.opportunities.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No opportunities found yet. Run a competitor scan to discover link building opportunities.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'assets' && (
        <Card>
          <CardHeader>
            <CardTitle>Linkable Assets ({data.assets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Title</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Backlinks</th>
                    <th className="text-left py-2 px-3">Shares</th>
                    <th className="text-left py-2 px-3">Site</th>
                    <th className="text-left py-2 px-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assets.map((asset) => (
                    <tr key={asset.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{asset.title}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                          {asset.assetType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3">{asset.backlinkCount}</td>
                      <td className="py-2 px-3">{asset.socialShares}</td>
                      <td className="py-2 px-3 text-gray-500">{asset.siteName}</td>
                      <td className="py-2 px-3 text-gray-500">{new Date(asset.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.assets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No linkable assets created yet. Generate statistics roundups, guides, or infographics to attract backlinks.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Backlinks */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Backlinks</CardTitle>
            </CardHeader>
            <CardContent>
              {data.backlinks.slice(0, 5).map((bl) => (
                <div key={bl.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{bl.sourceDomain}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[250px]">{bl.anchorText || 'No anchor'}</p>
                  </div>
                  <span className={`text-sm font-bold ${bl.domainAuthority >= 40 ? 'text-green-600' : 'text-gray-500'}`}>
                    DA {bl.domainAuthority}
                  </span>
                </div>
              ))}
              {data.backlinks.length === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">No backlinks tracked yet</p>
              )}
            </CardContent>
          </Card>

          {/* Top Opportunities */}
          <Card>
            <CardHeader>
              <CardTitle>Top Opportunities</CardTitle>
            </CardHeader>
            <CardContent>
              {data.opportunities.slice(0, 5).map((opp) => (
                <div key={opp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{opp.targetDomain}</p>
                    <p className="text-xs text-gray-500">{opp.opportunityType.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${opp.domainAuthority >= 40 ? 'text-green-600' : 'text-gray-500'}`}>
                      DA {opp.domainAuthority}
                    </span>
                    <p className="text-xs text-gray-400">{opp.status.replace(/_/g, ' ')}</p>
                  </div>
                </div>
              ))}
              {data.opportunities.length === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">No opportunities found yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
