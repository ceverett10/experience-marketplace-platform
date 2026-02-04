'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Opportunity {
  id: string;
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: 'INFORMATIONAL' | 'NAVIGATIONAL' | 'TRANSACTIONAL' | 'COMMERCIAL';
  niche: string;
  location: string | null;
  priorityScore: number;
  status:
    | 'IDENTIFIED'
    | 'EVALUATED'
    | 'ASSIGNED'
    | 'CONTENT_CREATING'
    | 'CONTENT_REVIEW'
    | 'PUBLISHED'
    | 'MONITORING'
    | 'ARCHIVED';
  source: string;
  siteId: string | null;
  explanation: string | null;
  createdAt: string;
  sourceData?: {
    scanMode?: string;
    optimizationRank?: number;
    optimizationJourney?: {
      firstSeenIteration: number;
      iterationScores: number[];
      wasRefined: boolean;
    };
    domainSuggestions?: {
      primary: string;
      alternatives: string[];
    };
    projectedValue?: {
      monthlyTraffic: number;
      monthlyRevenue: number;
      paybackPeriod: number;
    };
    keywordCluster?: {
      primaryKeyword: string;
      primaryVolume: number;
      clusterKeywords: Array<{ keyword: string; searchVolume: number; cpc: number }>;
      clusterTotalVolume: number;
      clusterKeywordCount: number;
      clusterAvgCpc: number;
    };
    dataForSeo?: {
      searchVolume: number;
      difficulty: number;
      cpc: number;
      trend?: string;
      competition?: number;
      seasonality?: number[];
    };
    holibobInventory?: {
      productCount: number;
      categories: string[];
    };
    iterationCount?: number;
    totalApiCost?: number;
  };
}

interface Stats {
  total: number;
  identified: number;
  evaluated: number;
  assigned: number;
  highPriority: number;
  archived: number;
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    identified: 0,
    evaluated: 0,
    assigned: 0,
    highPriority: 0,
    archived: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'volume' | 'cluster' | 'created'>('score');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [generatingExplanation, setGeneratingExplanation] = useState<string | null>(null);

  // Fetch opportunities from API
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/admin/api/opportunities?status=${statusFilter}`);
        const data = await response.json();
        setOpportunities(data.opportunities || []);
        setStats(
          data.stats || {
            total: 0,
            identified: 0,
            evaluated: 0,
            assigned: 0,
            highPriority: 0,
            archived: 0,
          }
        );
      } catch (error) {
        console.error('Failed to fetch opportunities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunities();
  }, [statusFilter]);

  const handleAction = async (opportunityId: string, action: 'dismiss' | 'create-site') => {
    try {
      if (action === 'dismiss') setDiscarding(opportunityId);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/opportunities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, action }),
      });

      if (response.ok) {
        // Remove discarded opportunity from local state immediately for snappy UX
        if (action === 'dismiss') {
          setOpportunities((prev) => prev.filter((o) => o.id !== opportunityId));
        }
        // Refresh opportunities
        const data = await fetch(`/admin/api/opportunities?status=${statusFilter}`).then((r) =>
          r.json()
        );
        setOpportunities(data.opportunities || []);
        setStats(
          data.stats || {
            total: 0,
            identified: 0,
            evaluated: 0,
            assigned: 0,
            highPriority: 0,
            archived: 0,
          }
        );
      }
    } catch (error) {
      console.error('Failed to perform action:', error);
    } finally {
      setDiscarding(null);
    }
  };

  const handleGenerateExplanation = async (opportunityId: string) => {
    try {
      setGeneratingExplanation(opportunityId);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/opportunities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, action: 'generate-explanation' }),
      });

      if (response.ok) {
        const result = await response.json();
        // Update the local state with the new explanation
        setOpportunities((prev) =>
          prev.map((opp) =>
            opp.id === opportunityId ? { ...opp, explanation: result.explanation } : opp
          )
        );
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to generate explanation: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to generate explanation:', error);
      alert('Failed to generate explanation. Please try again.');
    } finally {
      setGeneratingExplanation(null);
    }
  };

  const handleRunScan = async () => {
    try {
      setScanning(true);
      setScanMessage('Starting scan...');
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/opportunities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-scan' }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Scan started:', result);
        setScanMessage(`Scan job queued (ID: ${result.jobId}). Checking for results...`);

        // Poll for results every 5 seconds for up to 60 seconds
        let attempts = 0;
        const maxAttempts = 12;
        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            const data = await fetch(`/admin/api/opportunities?status=${statusFilter}`).then((r) =>
              r.json()
            );
            setOpportunities(data.opportunities || []);
            setStats(
              data.stats || {
                total: 0,
                identified: 0,
                evaluated: 0,
                assigned: 0,
                highPriority: 0,
                archived: 0,
              }
            );

            if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setScanning(false);
              setScanMessage('Scan complete. Results updated.');
              setTimeout(() => setScanMessage(null), 5000);
            } else {
              setScanMessage(`Scan in progress... (${attempts * 5}s elapsed)`);
            }
          } catch (err) {
            console.error('Error polling for results:', err);
          }
        }, 5000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setScanMessage(`Failed to start scan: ${errorData.error || 'Unknown error'}`);
        setScanning(false);
        setTimeout(() => setScanMessage(null), 5000);
      }
    } catch (error) {
      console.error('Failed to start scan:', error);
      setScanMessage('Failed to start scan. Please try again.');
      setScanning(false);
      setTimeout(() => setScanMessage(null), 5000);
    }
  };

  const sortedOpportunities = [...opportunities].sort((a, b) => {
    if (sortBy === 'score') return b.priorityScore - a.priorityScore;
    if (sortBy === 'volume') return b.searchVolume - a.searchVolume;
    if (sortBy === 'cluster') {
      const aCluster = a.sourceData?.keywordCluster?.clusterTotalVolume ?? a.searchVolume;
      const bCluster = b.sourceData?.keywordCluster?.clusterTotalVolume ?? b.searchVolume;
      return bCluster - aCluster;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getStatusBadge = (status: Opportunity['status']) => {
    const styles: Record<string, string> = {
      IDENTIFIED: 'bg-blue-100 text-blue-800',
      EVALUATED: 'bg-amber-100 text-amber-800',
      ASSIGNED: 'bg-green-100 text-green-800',
      CONTENT_CREATING: 'bg-indigo-100 text-indigo-800',
      CONTENT_REVIEW: 'bg-purple-100 text-purple-800',
      PUBLISHED: 'bg-emerald-100 text-emerald-800',
      MONITORING: 'bg-cyan-100 text-cyan-800',
      ARCHIVED: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`${styles[status] ?? 'bg-slate-100 text-slate-800'} text-xs px-2 py-1 rounded font-medium`}>
        {status?.replace(/_/g, ' ') ?? 'UNKNOWN'}
      </span>
    );
  };

  const getIntentIcon = (intent: Opportunity['intent']) => {
    const icons: Record<string, string> = {
      TRANSACTIONAL: '💰',
      COMMERCIAL: '🛍️',
      NAVIGATIONAL: '🧭',
      INFORMATIONAL: '📚',
    };
    return icons[intent] ?? '📋';
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-gray-600';
  };

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty >= 70) return 'text-red-600';
    if (difficulty >= 40) return 'text-amber-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading opportunities...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SEO Opportunities</h1>
          <p className="text-slate-500 mt-1">
            Keyword research results from DataForSEO integration
          </p>
        </div>
        <button
          onClick={handleRunScan}
          disabled={scanning}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          {scanning ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {/* Scan status message */}
      {scanMessage && (
        <div
          className={`p-4 rounded-lg ${scanning ? 'bg-sky-50 border border-sky-200' : 'bg-green-50 border border-green-200'}`}
        >
          <div className="flex items-center gap-2">
            {scanning && (
              <svg
                className="animate-spin h-4 w-4 text-sky-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            <span className={`text-sm ${scanning ? 'text-sky-700' : 'text-green-700'}`}>
              {scanMessage}
            </span>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.identified}</p>
            <p className="text-sm text-slate-500">Identified</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.evaluated}</p>
            <p className="text-sm text-slate-500">Evaluated</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{stats.assigned}</p>
            <p className="text-sm text-slate-500">Assigned</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-purple-600">{stats.highPriority}</p>
            <p className="text-sm text-slate-500">High Priority</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter(statusFilter === 'ARCHIVED' ? 'all' : 'ARCHIVED')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-400">{stats.archived}</p>
            <p className="text-sm text-slate-500">Discarded</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="IDENTIFIED">Identified</option>
          <option value="EVALUATED">Evaluated</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="CONTENT_CREATING">Content Creating</option>
          <option value="CONTENT_REVIEW">Content Review</option>
          <option value="PUBLISHED">Published</option>
          <option value="MONITORING">Monitoring</option>
          <option value="ARCHIVED">Discarded</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'score' | 'volume' | 'cluster' | 'created')}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="score">Sort by Priority Score</option>
          <option value="volume">Sort by Search Volume</option>
          <option value="cluster">Sort by Cluster Volume</option>
          <option value="created">Sort by Date</option>
        </select>
      </div>

      {/* Opportunities list */}
      <div className="space-y-4">
        {sortedOpportunities.map((opp) => (
          <Card key={opp.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">{opp.keyword}</h3>
                    {getStatusBadge(opp.status)}
                    <span className="text-sm">{getIntentIcon(opp.intent)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>
                      📍 {opp.location} • {opp.niche}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold ${getScoreColor(opp.priorityScore)}`}>
                    {opp.priorityScore}
                  </div>
                  <div className="text-xs text-slate-500">Priority Score</div>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Search Volume</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {(opp.searchVolume ?? 0).toLocaleString()}
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Keyword Difficulty</div>
                  <div className={`text-lg font-semibold ${getDifficultyColor(opp.difficulty)}`}>
                    {opp.difficulty}
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">CPC</div>
                  <div className="text-lg font-semibold text-slate-900">${Number(opp.cpc ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Products</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {opp.sourceData?.holibobInventory?.productCount?.toLocaleString() ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Trend</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {opp.sourceData?.dataForSeo?.trend ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Rank</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {opp.sourceData?.optimizationRank ? `#${opp.sourceData.optimizationRank}` : '—'}
                  </div>
                </div>
              </div>

              {/* Keyword Cluster */}
              {opp.sourceData?.keywordCluster && (
                <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">🔗</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-purple-900">Keyword Cluster</h4>
                        <div className="text-lg font-bold text-purple-900">
                          {(opp.sourceData.keywordCluster.clusterTotalVolume ?? 0).toLocaleString()}
                          <span className="text-xs text-purple-600 font-normal ml-1">
                            /mo total ({opp.sourceData.keywordCluster.clusterKeywordCount ?? 0} keywords)
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-semibold">
                          {opp.keyword}:{' '}
                          {(opp.sourceData.keywordCluster.primaryVolume ?? 0).toLocaleString()}/mo
                        </span>
                        {(opp.sourceData.keywordCluster.clusterKeywords ?? [])
                          .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
                          .slice(0, 8)
                          .map((kw, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded"
                            >
                              {kw.keyword}: {(kw.searchVolume ?? 0).toLocaleString()}/mo
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Domain Suggestions */}
              {opp.sourceData?.domainSuggestions && (
                <div className="mt-4 p-4 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">🌐</span>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-sky-900 mb-3">Suggested Domains</h4>

                      {/* Primary Domain */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-sky-700 bg-sky-200 px-2 py-0.5 rounded">
                                PRIMARY
                              </span>
                              {opp.sourceData.scanMode && (
                                <span className="text-xs font-medium text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                                  {opp.sourceData.scanMode.replace(/_/g, ' ').toUpperCase()}
                                </span>
                              )}
                            </div>
                            <code className="text-sm font-mono font-semibold text-slate-900 block mt-1">
                              {opp.sourceData.domainSuggestions.primary}
                            </code>
                          </div>
                          <a
                            href={`https://dash.cloudflare.com/?to=/:account/domains/register/${opp.sourceData.domainSuggestions.primary}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                            </svg>
                            Purchase on Cloudflare
                          </a>
                        </div>
                      </div>

                      {/* Alternative Domains */}
                      {opp.sourceData.domainSuggestions.alternatives &&
                        opp.sourceData.domainSuggestions.alternatives.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-slate-600 mb-2">
                              ALTERNATIVES
                            </div>
                            <div className="space-y-1">
                              {opp.sourceData.domainSuggestions.alternatives.map((domain, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-3 py-1"
                                >
                                  <code className="text-xs font-mono text-slate-700">{domain}</code>
                                  <a
                                    href={`https://dash.cloudflare.com/?to=/:account/domains/register/${domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1"
                                  >
                                    Purchase
                                    <svg
                                      className="w-3 h-3"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                    </svg>
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {/* Projected Value */}
              {opp.sourceData?.projectedValue && (
                <div className="mt-4 grid grid-cols-3 gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <div className="text-xs text-green-600 font-semibold mb-1">
                      PROJECTED TRAFFIC
                    </div>
                    <div className="text-lg font-bold text-green-900">
                      {(opp.sourceData.projectedValue.monthlyTraffic ?? 0).toLocaleString()}
                      <span className="text-xs text-green-600 font-normal ml-1">/month</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-green-600 font-semibold mb-1">
                      PROJECTED REVENUE
                    </div>
                    <div className="text-lg font-bold text-green-900">
                      £{(opp.sourceData.projectedValue.monthlyRevenue ?? 0).toLocaleString()}
                      <span className="text-xs text-green-600 font-normal ml-1">/month</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-green-600 font-semibold mb-1">PAYBACK PERIOD</div>
                    <div className="text-lg font-bold text-green-900">
                      {opp.sourceData.projectedValue.paybackPeriod ?? '—'}
                      <span className="text-xs text-green-600 font-normal ml-1">months</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Explanation */}
              {opp.explanation ? (
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-lg mt-0.5">💡</span>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-indigo-900 mb-1">
                        Why This Opportunity?
                      </h4>
                      <p className="text-sm text-indigo-800 leading-relaxed">{opp.explanation}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-sm">💡</span>
                      <span className="text-sm">No explanation generated yet</span>
                    </div>
                    <button
                      onClick={() => handleGenerateExplanation(opp.id)}
                      disabled={generatingExplanation === opp.id}
                      className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1"
                    >
                      {generatingExplanation === opp.id ? (
                        <>
                          <svg
                            className="animate-spin h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        'Generate Explanation'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  Created {new Date(opp.createdAt).toLocaleDateString()}
                  {opp.sourceData?.scanMode && (
                    <span className="ml-2 text-xs text-slate-400">
                      via {opp.sourceData.scanMode.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {opp.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => handleAction(opp.id, 'dismiss')}
                      disabled={discarding === opp.id}
                      className="px-3 py-1.5 text-sm border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      {discarding === opp.id ? 'Discarding...' : 'Discard'}
                    </button>
                  )}
                  {(opp.status === 'IDENTIFIED' || opp.status === 'EVALUATED') && (
                    <button
                      onClick={() => handleAction(opp.id, 'create-site')}
                      className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
                    >
                      Create Site
                    </button>
                  )}
                  {opp.siteId && (
                    <a
                      href={`/sites/${opp.siteId}`}
                      className="px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                    >
                      View Site →
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {sortedOpportunities.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-medium text-slate-900">No opportunities found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your filters or run a new scan</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
