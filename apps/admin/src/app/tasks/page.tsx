'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  context: any;
  dueDate: string | null;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  siteName: string | null;
  siteId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  urgent: number;
}

const CATEGORIES = [
  { value: 'DOMAIN_PURCHASE', label: 'Domain Purchase', icon: '🌐' },
  { value: 'DNS_CONFIGURATION', label: 'DNS Configuration', icon: '☁️' },
  { value: 'SSL_SETUP', label: 'SSL Setup', icon: '🔒' },
  { value: 'CONTENT_REVIEW', label: 'Content Review', icon: '📝' },
  { value: 'SEO_OPTIMIZATION', label: 'SEO Optimization', icon: '🔍' },
  { value: 'SITE_CONFIGURATION', label: 'Site Configuration', icon: '⚙️' },
  { value: 'EXTERNAL_SERVICE', label: 'External Service', icon: '🔗' },
  { value: 'OTHER', label: 'Other', icon: '📋' },
];

const PRIORITIES = [
  { value: 'URGENT', label: 'Urgent', color: 'bg-red-100 text-red-800' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-800' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  { value: 'LOW', label: 'Low', color: 'bg-gray-100 text-gray-800' },
];

const STATUSES = [
  { value: 'PENDING', label: 'Pending', color: 'bg-gray-100 text-gray-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'BLOCKED', label: 'Blocked', color: 'bg-red-100 text-red-800' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-slate-100 text-slate-800' },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    urgent: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    category: 'OTHER',
    priority: 'MEDIUM',
  });

  // Fetch tasks from API
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);

      const basePath = process.env.NODE_ENV === 'production' ? '/admin' : '';
      const response = await fetch(`${basePath}/api/tasks?${params.toString()}`);
      const data = await response.json();
      setTasks(data.tasks || []);
      setStats(data.stats || { total: 0, pending: 0, inProgress: 0, completed: 0, urgent: 0 });
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [statusFilter, categoryFilter]);

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const basePath = process.env.NODE_ENV === 'production' ? '/admin' : '';
      const response = await fetch(`${basePath}/api/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (response.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const createTask = async () => {
    if (!newTask.title.trim()) {
      alert('Please enter a task title');
      return;
    }
    try {
      const basePath = process.env.NODE_ENV === 'production' ? '/admin' : '';
      const response = await fetch(`${basePath}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      if (response.ok) {
        setShowAddModal(false);
        setNewTask({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM' });
        fetchTasks();
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const basePath = process.env.NODE_ENV === 'production' ? '/admin' : '';
      const response = await fetch(`${basePath}/api/tasks?id=${taskId}`, { method: 'DELETE' });
      if (response.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const getCategoryIcon = (category: string) => {
    return CATEGORIES.find((c) => c.value === category)?.icon || '📋';
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  const getPriorityBadge = (priority: string) => {
    const p = PRIORITIES.find((pr) => pr.value === priority);
    return (
      <span
        className={`${p?.color || 'bg-gray-100 text-gray-800'} text-xs px-2 py-1 rounded font-medium`}
      >
        {p?.label || priority}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const s = STATUSES.find((st) => st.value === status);
    return (
      <span
        className={`${s?.color || 'bg-gray-100 text-gray-800'} text-xs px-2 py-1 rounded font-medium`}
      >
        {s?.label || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manual Tasks</h1>
          <p className="text-slate-500 mt-1">Track manual activities that require your attention</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Add Task
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('all')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total Tasks</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('PENDING')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-sm text-slate-500">Pending</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('IN_PROGRESS')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
            <p className="text-sm text-slate-500">In Progress</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('COMPLETED')}
        >
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-sm text-slate-500">Completed</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{stats.urgent}</p>
            <p className="text-sm text-slate-500">Urgent</p>
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
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tasks list */}
      <div className="space-y-4">
        {tasks.map((task) => (
          <Card key={task.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{getCategoryIcon(task.category)}</span>
                    <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                    {getPriorityBadge(task.priority)}
                    {getStatusBadge(task.status)}
                  </div>
                  {task.description && (
                    <p className="text-sm text-slate-600 ml-9">{task.description}</p>
                  )}
                  {task.siteName && (
                    <p className="text-sm text-slate-500 ml-9 mt-1">Site: {task.siteName}</p>
                  )}
                </div>
              </div>

              {/* Context info if present */}
              {task.context &&
                typeof task.context === 'object' &&
                Object.keys(task.context).length > 0 && (
                  <div className="ml-9 mt-3 p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-2">Context:</p>
                    <div className="text-sm text-slate-700">
                      {Object.entries(task.context).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium">{key}:</span> {String(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Actions */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  {getCategoryLabel(task.category)} • Created{' '}
                  {new Date(task.createdAt).toLocaleDateString()}
                  {task.completedAt &&
                    ` • Completed ${new Date(task.completedAt).toLocaleDateString()}`}
                </div>
                <div className="flex items-center gap-2">
                  {task.status === 'PENDING' && (
                    <button
                      onClick={() => updateTaskStatus(task.id, 'IN_PROGRESS')}
                      className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Start
                    </button>
                  )}
                  {task.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => updateTaskStatus(task.id, 'COMPLETED')}
                      className="px-3 py-1.5 text-sm bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      Complete
                    </button>
                  )}
                  {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                    <button
                      onClick={() => updateTaskStatus(task.id, 'BLOCKED')}
                      className="px-3 py-1.5 text-sm border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      Block
                    </button>
                  )}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {tasks.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-lg font-medium text-slate-900">No tasks found</h3>
            <p className="text-slate-500 mt-1">
              {statusFilter !== 'all' || categoryFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create a new task to get started'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Add New Task</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g., Purchase domain example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  rows={3}
                  placeholder="Additional details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={newTask.category}
                    onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTask}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
