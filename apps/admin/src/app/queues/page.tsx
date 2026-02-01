'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface JobInfo {
  id: string;
  name: string;
  data: any;
  progress: number;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
}

interface Totals {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export default function QueuesPage() {
  const [queues, setQueues] = useState<QueueStats[]>([]);
  const [totals, setTotals] = useState<Totals>({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  });
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('waiting');
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch queue stats
  useEffect(() => {
    const fetchQueues = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/queues');
        const data = await response.json();
        setQueues(data.queues);
        setTotals(data.totals);
      } catch (error) {
        console.error('Failed to fetch queues:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQueues();
    const interval = setInterval(fetchQueues, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch jobs for selected queue
  useEffect(() => {
    if (!selectedQueue) return;

    const fetchJobs = async () => {
      try {
        const response = await fetch(`/api/queues?queue=${selectedQueue}&status=${selectedStatus}`);
        const data = await response.json();
        setJobs(data.jobs);
      } catch (error) {
        console.error('Failed to fetch jobs:', error);
      }
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
  }, [selectedQueue, selectedStatus]);

  const handleQueueAction = async (action: string, queueName?: string, jobId?: string) => {
    try {
      const response = await fetch('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, queueName, jobId }),
      });

      if (response.ok) {
        // Refresh data
        const data = await fetch('/api/queues').then((r) => r.json());
        setQueues(data.queues);
        setTotals(data.totals);
      }
    } catch (error) {
      console.error('Failed to perform action:', error);
    }
  };

  const getQueueHealth = (queue: QueueStats): 'healthy' | 'warning' | 'critical' => {
    if (queue.paused) return 'warning';
    if (queue.failed > 10) return 'critical';
    if (queue.waiting > 100) return 'warning';
    return 'healthy';
  };

  const getHealthColor = (health: string) => {
    if (health === 'healthy') return 'text-green-600 bg-green-50';
    if (health === 'warning') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading queue stats...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Queue Monitoring</h1>
          <p className="text-slate-500 mt-1">Real-time job queue status and management</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-slate-500">Live updates</span>
        </div>
      </div>

      {/* Totals cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{totals.waiting}</p>
            <p className="text-sm text-slate-500">Waiting</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{totals.active}</p>
            <p className="text-sm text-slate-500">Active</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-600">{totals.completed}</p>
            <p className="text-sm text-slate-500">Completed</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{totals.failed}</p>
            <p className="text-sm text-slate-500">Failed</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{totals.delayed}</p>
            <p className="text-sm text-slate-500">Delayed</p>
          </CardContent>
        </Card>
      </div>

      {/* Queues list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {queues.map((queue) => {
          const health = getQueueHealth(queue);
          return (
            <Card
              key={queue.name}
              className={`overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${
                selectedQueue === queue.name ? 'ring-2 ring-sky-500' : ''
              }`}
              onClick={() => setSelectedQueue(queue.name)}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900 capitalize">
                        {queue.name.replace(/-/g, ' ')}
                      </h3>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${getHealthColor(health)}`}
                      >
                        {health}
                      </span>
                      {queue.paused && (
                        <span className="text-xs px-2 py-1 rounded font-medium bg-gray-100 text-gray-800">
                          Paused
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Queue metrics */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  <div className="text-center p-2 bg-blue-50 rounded">
                    <div className="text-lg font-bold text-blue-600">{queue.waiting}</div>
                    <div className="text-xs text-slate-500">Wait</div>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded">
                    <div className="text-lg font-bold text-green-600">{queue.active}</div>
                    <div className="text-xs text-slate-500">Active</div>
                  </div>
                  <div className="text-center p-2 bg-emerald-50 rounded">
                    <div className="text-lg font-bold text-emerald-600">{queue.completed}</div>
                    <div className="text-xs text-slate-500">Done</div>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded">
                    <div className="text-lg font-bold text-red-600">{queue.failed}</div>
                    <div className="text-xs text-slate-500">Fail</div>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded">
                    <div className="text-lg font-bold text-amber-600">{queue.delayed}</div>
                    <div className="text-xs text-slate-500">Delay</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {queue.paused ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQueueAction('resume', queue.name);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQueueAction('pause', queue.name);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      Pause
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQueueAction('clean', queue.name);
                    }}
                    className="flex-1 px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    Clean
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Job details */}
      {selectedQueue && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 capitalize">
                {selectedQueue.replace(/-/g, ' ')} Jobs
              </h2>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="waiting">Waiting</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="space-y-2">
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No {selectedStatus} jobs</div>
              ) : (
                jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">Job #{job.id}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {job.name} • Attempts: {job.attemptsMade}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedStatus === 'failed' && (
                          <button
                            onClick={() => handleQueueAction('retry', selectedQueue, job.id)}
                            className="px-3 py-1 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => handleQueueAction('remove', selectedQueue, job.id)}
                          className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {job.failedReason && (
                      <div className="p-2 bg-red-50 rounded text-sm text-red-800 mb-2">
                        {job.failedReason}
                      </div>
                    )}

                    <div className="text-xs text-slate-500">
                      Created: {new Date(job.timestamp).toLocaleString()}
                      {job.processedOn && (
                        <> • Processed: {new Date(job.processedOn).toLocaleString()}</>
                      )}
                      {job.finishedOn && (
                        <> • Finished: {new Date(job.finishedOn).toLocaleString()}</>
                      )}
                    </div>

                    {selectedStatus === 'active' && job.progress > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>Progress</span>
                          <span>{job.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-sky-600 h-2 rounded-full transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      )}

      {!selectedQueue && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">⚙️</div>
            <h3 className="text-lg font-medium text-slate-900">Select a queue</h3>
            <p className="text-slate-500 mt-1">Click on a queue above to view its jobs</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
