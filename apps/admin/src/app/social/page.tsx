'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface SocialPost {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  status: string;
  platformUrl: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  site: { id: string; name: string };
  page: { id: string; title: string; slug: string } | null;
}

export default function SocialOverviewPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/admin/api/social/posts');
      const data = await response.json();
      if (data.success) {
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error('Failed to fetch social posts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const publishedCount = posts.filter((p) => p.status === 'PUBLISHED').length;
  const scheduledCount = posts.filter(
    (p) => p.status === 'SCHEDULED' || p.status === 'PUBLISHING'
  ).length;
  const failedCount = posts.filter((p) => p.status === 'FAILED').length;
  const todayCount = posts.filter(
    (p) => p.publishedAt && new Date(p.publishedAt).toDateString() === new Date().toDateString()
  ).length;

  const platformIcons: Record<string, string> = {
    PINTEREST: '📌',
    FACEBOOK: '📘',
    TWITTER: '🐦',
  };

  const statusColors: Record<string, string> = {
    PUBLISHED: 'bg-green-100 text-green-800',
    SCHEDULED: 'bg-blue-100 text-blue-800',
    PUBLISHING: 'bg-sky-100 text-sky-800',
    DRAFT: 'bg-slate-100 text-slate-600',
    FAILED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Social Media</h1>
          <p className="text-slate-500 mt-1">Automated social posting across all connected sites</p>
        </div>
        <button
          onClick={async () => {
            try {
              const res = await fetch('/admin/api/operations/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobType: 'SOCIAL_DAILY_POSTING' }),
              });
              const data = await res.json();
              if (data.success) {
                alert('Daily social posting triggered');
              }
            } catch (err) {
              console.error('Failed to trigger:', err);
            }
          }}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Trigger Daily Posting
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-700">{publishedCount}</p>
            <p className="text-sm text-slate-500">Published</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{scheduledCount}</p>
            <p className="text-sm text-slate-500">Scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{todayCount}</p>
            <p className="text-sm text-slate-500">Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{failedCount}</p>
            <p className="text-sm text-slate-500">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Posts List */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Recent Posts</h2>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse h-16 bg-slate-100 rounded" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-500">No social posts yet.</p>
              <p className="text-sm text-slate-400 mt-1">
                Connect social accounts on individual site pages to get started.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {posts.map((post) => (
                <div key={post.id} className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{platformIcons[post.platform] || '📱'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-900">{post.site.name}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            statusColors[post.status] || 'bg-slate-100'
                          }`}
                        >
                          {post.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(post.publishedAt || post.createdAt).toLocaleDateString(
                            'en-GB',
                            {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-1">{post.caption}</p>
                      {post.page && (
                        <p className="text-xs text-slate-400 mt-0.5">Blog: {post.page.title}</p>
                      )}
                      {post.errorMessage && (
                        <p className="text-xs text-red-500 mt-0.5">{post.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {post.platformUrl && (
                        <a
                          href={post.platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sky-600 hover:text-sky-800"
                        >
                          View
                        </a>
                      )}
                      {post.status === 'FAILED' && (
                        <button
                          onClick={async () => {
                            try {
                              await fetch('/admin/api/social/posts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'retry',
                                  socialPostId: post.id,
                                }),
                              });
                              fetchPosts();
                            } catch (err) {
                              console.error('Retry failed:', err);
                            }
                          }}
                          className="text-xs text-amber-600 hover:text-amber-800"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
