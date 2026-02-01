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
  status: 'IDENTIFIED' | 'EVALUATED' | 'ASSIGNED' | 'CONTENT_CREATING' | 'CONTENT_REVIEW' | 'PUBLISHED' | 'MONITORING' | 'ARCHIVED';
  source: string;
  siteId: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  identified: number;
  evaluated: number;
  assigned: number;
  highPriority: number;
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    identified: 0,
    evaluated: 0,
    assigned: 0,
    highPriority: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'volume' | 'created'>('score');
  const [loading, setLoading] = useState(true);

  // Fetch opportunities from API
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/opportunities?status=${statusFilter}`);
        const data = await response.json();
        setOpportunities(data.opportunities);
        setStats(data.stats);
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
      const response = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, action }),
      });

      if (response.ok) {
        // Refresh opportunities
        const data = await fetch(`/api/opportunities?status=${statusFilter}`).then((r) => r.json());
        setOpportunities(data.opportunities);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to perform action:', error);
    }
  };

  const sortedOpportunities = [...opportunities].sort((a, b) => {
    if (sortBy === 'score') return b.priorityScore - a.priorityScore;
    if (sortBy === 'volume') return b.searchVolume - a.searchVolume;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getStatusBadge = (status: Opportunity['status']) => {
    const styles = {
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
      <span className={`${styles[status]} text-xs px-2 py-1 rounded font-medium`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  const getIntentIcon = (intent: Opportunity['intent']) => {
    const icons = {
      TRANSACTIONAL: '💰',
      COMMERCIAL: '🛍️',
      NAVIGATIONAL: '🧭',
      INFORMATIONAL: '📚',
    };
    return icons[intent];
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
        <button className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors">
          Run Scan
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
          <option value="ARCHIVED">Archived</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'score' | 'volume' | 'created')}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="score">Sort by Priority Score</option>
          <option value="volume">Sort by Search Volume</option>
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
              <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Search Volume</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {opp.searchVolume.toLocaleString()}
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
                  <div className="text-lg font-semibold text-slate-900">
                    ${opp.cpc.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Source</div>
                  <div className="text-sm font-medium text-slate-700">{opp.source}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  Created {new Date(opp.createdAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  {opp.status === 'IDENTIFIED' && (
                    <>
                      <button
                        onClick={() => handleAction(opp.id, 'dismiss')}
                        className="px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleAction(opp.id, 'create-site')}
                        className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
                      >
                        Create Site
                      </button>
                    </>
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
