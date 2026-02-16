'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface McpApiKeyInfo {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Partner {
  id: string;
  name: string;
  contactEmail: string;
  holibobPartnerId: string;
  holibobApiUrl: string;
  paymentModel: string;
  status: string;
  apiKeyCount: number;
  activeKeyCount: number;
  mcpApiKeys: McpApiKeyInfo[];
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  totalKeys: number;
}

export default function PartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, suspended: 0, totalKeys: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyDisplay, setNewKeyDisplay] = useState<{ partnerName: string; key: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPartnerId, setFormPartnerId] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formApiSecret, setFormApiSecret] = useState('');
  const [formPaymentModel, setFormPaymentModel] = useState('REQUIRED');

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/admin/api/partners?status=${statusFilter}`);
      const data = await response.json();
      if (data.partners) setPartners(data.partners);
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch partners:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const response = await fetch('/admin/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          contactEmail: formEmail,
          holibobPartnerId: formPartnerId,
          holibobApiKey: formApiKey,
          holibobApiSecret: formApiSecret || undefined,
          paymentModel: formPaymentModel,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Show the key once
        setNewKeyDisplay({ partnerName: formName, key: data.mcpApiKey.key });
        setShowCreateForm(false);
        setFormName('');
        setFormEmail('');
        setFormPartnerId('');
        setFormApiKey('');
        setFormApiSecret('');
        setFormPaymentModel('REQUIRED');
        fetchPartners();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to create partner');
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    SUSPENDED: 'bg-amber-100 text-amber-700',
    ARCHIVED: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">MCP Partners</h1>
          <p className="text-slate-500 mt-1">Manage partner API keys for the Holibob MCP Server</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium"
        >
          + Add Partner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Partners', value: stats.total, color: 'text-slate-900' },
          { label: 'Active', value: stats.active, color: 'text-emerald-600' },
          { label: 'Suspended', value: stats.suspended, color: 'text-amber-600' },
          { label: 'API Keys Issued', value: stats.totalKeys, color: 'text-sky-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New Key Display — shown once after creation */}
      {newKeyDisplay && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-emerald-800">
                Partner Created: {newKeyDisplay.partnerName}
              </h3>
              <p className="text-emerald-600 mt-1 text-sm">
                Copy this MCP API key now. It will not be shown again.
              </p>
            </div>
            <button
              onClick={() => setNewKeyDisplay(null)}
              className="text-emerald-400 hover:text-emerald-600"
            >
              x
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <code className="flex-1 bg-white border border-emerald-300 rounded px-4 py-3 font-mono text-sm text-slate-800 select-all">
              {newKeyDisplay.key}
            </code>
            <button
              onClick={() => copyToClipboard(newKeyDisplay.key)}
              className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">Status:</span>
        {['all', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              statusFilter === s
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Add New Partner</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Partner Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="Acme Travel"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="partner@example.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Holibob Partner ID *
                  </label>
                  <input
                    type="text"
                    value={formPartnerId}
                    onChange={(e) => setFormPartnerId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="holibob"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Payment Model
                  </label>
                  <select
                    value={formPaymentModel}
                    onChange={(e) => setFormPaymentModel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  >
                    <option value="REQUIRED">Required (Consumer Pays)</option>
                    <option value="ON_ACCOUNT">On Account (Partner Billed)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Holibob API Key *
                  </label>
                  <input
                    type="password"
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="Enter API key"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Holibob API Secret (optional)
                  </label>
                  <input
                    type="password"
                    value={formApiSecret}
                    onChange={(e) => setFormApiSecret(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="Enter API secret (for HMAC auth)"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {creating ? 'Creating...' : 'Create Partner'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Partners List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading partners...</div>
      ) : partners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-500 text-lg">No partners yet</p>
            <p className="text-slate-400 mt-1">
              Add a partner to issue MCP API keys for the Holibob booking flow.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {partners.map((partner) => (
            <Card key={partner.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-slate-900">{partner.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[partner.status] ?? 'bg-slate-100 text-slate-500'}`}
                      >
                        {partner.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700">
                        {partner.paymentModel === 'ON_ACCOUNT' ? 'On Account' : 'Consumer Pays'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-500">
                      <span>{partner.contactEmail}</span>
                      <span>Partner ID: {partner.holibobPartnerId}</span>
                      <span>
                        {partner.activeKeyCount} active key{partner.activeKeyCount !== 1 ? 's' : ''}
                      </span>
                      <span>Created {new Date(partner.createdAt).toLocaleDateString()}</span>
                    </div>
                    {/* Show active keys */}
                    {partner.mcpApiKeys.filter((k) => k.isActive).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {partner.mcpApiKeys
                          .filter((k) => k.isActive)
                          .map((k) => (
                            <span
                              key={k.id}
                              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-600"
                            >
                              {k.name}: <span className="text-slate-400">{k.key}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => router.push(`/partners/${partner.id}`)}
                    className="ml-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                  >
                    Manage
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
