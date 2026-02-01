'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, Button } from '@experience-marketplace/ui-components';

interface ContentItem {
  id: string;
  type: 'experience' | 'collection' | 'seo' | 'blog';
  title: string;
  content: string;
  siteName: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  qualityScore: number;
  generatedAt: string;
}

export default function AdminContentPage() {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [filteredContent, setFilteredContent] = useState<ContentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch content from API
  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch('/admin/api/content');

        if (!response.ok) {
          throw new Error('Failed to fetch content');
        }

        const data = await response.json();
        setContent(data);
      } catch (err) {
        console.error('Error fetching content:', err);
        setError('Failed to load content. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, []);

  // Filter content based on search and status
  useEffect(() => {
    let filtered = content;

    if (searchQuery) {
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.siteName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((item) => item.status === statusFilter);
    }

    setFilteredContent(filtered);
  }, [content, searchQuery, statusFilter]);

  const stats = {
    total: content.length,
    pending: content.filter((c) => c.status === 'pending').length,
    approved: content.filter((c) => c.status === 'approved').length,
    published: content.filter((c) => c.status === 'published').length,
  };

  const updateContentStatus = async (id: string, status: ContentItem['status']) => {
    try {
      const response = await fetch('/admin/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update content');
      }

      // Update local state
      setContent((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      );
      setSelectedContent(null);
    } catch (err) {
      console.error('Error updating content:', err);
      alert('Failed to update content. Please try again.');
    }
  };

  const handleApprove = (id: string) => {
    updateContentStatus(id, 'approved');
  };

  const handleReject = (id: string) => {
    updateContentStatus(id, 'rejected');
  };

  const handlePublish = (id: string) => {
    updateContentStatus(id, 'published');
  };

  const getStatusBadge = (status: ContentItem['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded">Pending</span>
        );
      case 'approved':
        return (
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Approved</span>
        );
      case 'rejected':
        return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Rejected</span>;
      case 'published':
        return (
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Published</span>
        );
    }
  };

  const getTypeIcon = (type: ContentItem['type']) => {
    switch (type) {
      case 'experience':
        return '🎯';
      case 'collection':
        return '📚';
      case 'seo':
        return '🔍';
      case 'blog':
        return '📝';
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-slate-600">Loading content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview Modal */}
      {selectedContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Content Preview</h3>
                <p className="text-sm text-slate-500">{selectedContent.siteName}</p>
              </div>
              <button
                onClick={() => setSelectedContent(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <h4 className="text-xl font-semibold text-slate-900">{selectedContent.title}</h4>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span>
                    {getTypeIcon(selectedContent.type)} {selectedContent.type}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span>✨</span>
                  <span className="text-sm font-medium text-slate-700">AI Quality Score</span>
                  <span className={`font-bold ${getQualityColor(selectedContent.qualityScore)}`}>
                    {selectedContent.qualityScore}/100
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      selectedContent.qualityScore >= 85
                        ? 'bg-green-500'
                        : selectedContent.qualityScore >= 70
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${selectedContent.qualityScore}%` }}
                  />
                </div>
              </div>

              <div className="prose prose-slate max-w-none">
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selectedContent.content}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <div>{getStatusBadge(selectedContent.status)}</div>
              <div className="flex items-center gap-2">
                {selectedContent.status === 'pending' && (
                  <>
                    <Button
                      onClick={() => handleReject(selectedContent.id)}
                      className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                    >
                      ✕ Reject
                    </Button>
                    <Button
                      onClick={() => handleApprove(selectedContent.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                    >
                      ✓ Approve
                    </Button>
                  </>
                )}
                {selectedContent.status === 'approved' && (
                  <Button
                    onClick={() => handlePublish(selectedContent.id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    🚀 Publish
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Content Management</h1>
          <p className="text-slate-500 mt-1">Review and manage AI-generated content</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('all')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('pending')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-sm text-slate-500">Pending</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('approved')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
            <p className="text-sm text-slate-500">Approved</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('published')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.published}</p>
            <p className="text-sm text-slate-500">Published</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
          <input
            type="text"
            placeholder="Search content or sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* Content list */}
      {filteredContent.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="text-lg font-medium text-slate-900">No content found</h3>
            <p className="text-slate-500 mt-1">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'No AI-generated content available'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredContent.map((item) => (
            <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div
                      className={`h-12 w-12 rounded-xl flex items-center justify-center text-2xl ${
                        item.status === 'pending'
                          ? 'bg-amber-100'
                          : item.status === 'approved'
                            ? 'bg-green-100'
                            : item.status === 'rejected'
                              ? 'bg-red-100'
                              : 'bg-blue-100'
                      }`}
                    >
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 truncate">{item.title}</h3>
                        {getStatusBadge(item.status)}
                      </div>
                      <p className="text-sm text-slate-500 mb-2">{item.siteName}</p>
                      <p className="text-sm text-slate-600 line-clamp-2">{item.content}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          ✨ Quality:{' '}
                          <span className={getQualityColor(item.qualityScore)}>
                            {item.qualityScore}/100
                          </span>
                        </span>
                        <span>Generated: {new Date(item.generatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setSelectedContent(item)}
                      className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                      title="Preview"
                    >
                      👁️
                    </button>
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleReject(item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Reject"
                        >
                          ✕
                        </button>
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Approve"
                        >
                          ✓
                        </button>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <button
                        onClick={() => handlePublish(item.id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Publish
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
