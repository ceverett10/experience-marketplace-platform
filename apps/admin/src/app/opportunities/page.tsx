'use client';

import React, { useState } from 'react';
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
  status: 'IDENTIFIED' | 'EVALUATED' | 'ASSIGNED' | 'ACTIONED' | 'DISMISSED';
  source: string;
  siteId: string | null;
  createdAt: string;
}

// Mock data for now - in production, fetch from API
const mockOpportunities: Opportunity[] = [
  {
    id: '1',
    keyword: 'london food tours',
    searchVolume: 8100,
    difficulty: 42,
    cpc: 2.35,
    intent: 'TRANSACTIONAL',
    niche: 'food tours',
    location: 'London, England',
    priorityScore: 87,
    status: 'IDENTIFIED',
    source: 'opportunity_scan',
    siteId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    keyword: 'paris walking tours',
    searchVolume: 12500,
    difficulty: 38,
    cpc: 1.95,
    intent: 'TRANSACTIONAL',
    niche: 'walking tours',
    location: 'Paris, France',
    priorityScore: 91,
    status: 'EVALUATED',
    source: 'opportunity_scan',
    siteId: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '3',
    keyword: 'barcelona wine tasting',
    searchVolume: 3200,
    difficulty: 35,
    cpc: 3.45,
    intent: 'TRANSACTIONAL',
    niche: 'wine tasting',
    location: 'Barcelona, Spain',
    priorityScore: 78,
    status: 'ASSIGNED',
    source: 'opportunity_scan',
    siteId: 'site-123',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(mockOpportunities);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'volume' | 'created'>('score');

  const filteredOpportunities = opportunities
    .filter((opp) => statusFilter === 'all' || opp.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'score') return b.priorityScore - a.priorityScore;
      if (sortBy === 'volume') return b.searchVolume - a.searchVolume;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const stats = {
    total: opportunities.length,
    identified: opportunities.filter((o) => o.status === 'IDENTIFIED').length,
    evaluated: opportunities.filter((o) => o.status === 'EVALUATED').length,
    assigned: opportunities.filter((o) => o.status === 'ASSIGNED').length,
    highPriority: opportunities.filter((o) => o.priorityScore >= 75).length,
  };

  const getStatusBadge = (status: Opportunity['status']) => {
    const styles = {
      IDENTIFIED: 'bg-blue-100 text-blue-800',
      EVALUATED: 'bg-amber-100 text-amber-800',
      ASSIGNED: 'bg-green-100 text-green-800',
      ACTIONED: 'bg-purple-100 text-purple-800',
      DISMISSED: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`${styles[status]} text-xs px-2 py-1 rounded font-medium`}>{status}</span>
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
          <option value="ACTIONED">Actioned</option>
          <option value="DISMISSED">Dismissed</option>
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
        {filteredOpportunities.map((opp) => (
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
                      <button className="px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                        Dismiss
                      </button>
                      <button className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors">
                        Create Site
                      </button>
                    </>
                  )}
                  {opp.siteId && (
                    <button className="px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                      View Site →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredOpportunities.length === 0 && (
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
