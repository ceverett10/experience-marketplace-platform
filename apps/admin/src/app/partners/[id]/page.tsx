'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface McpApiKey {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  rateLimitRpm: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface PartnerDetail {
  id: string;
  name: string;
  contactEmail: string;
  holibobPartnerId: string;
  holibobApiUrl: string;
  holibobApiKey: string;
  holibobApiSecret: string | null;
  paymentModel: string;
  status: string;
  mcpApiKeys: McpApiKey[];
  createdAt: string;
  updatedAt: string;
}

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKeyDisplay, setNewKeyDisplay] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPaymentModel, setEditPaymentModel] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fetchPartner = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/admin/api/partners/${id}`);
      const data = await response.json();
      if (data.partner) {
        setPartner(data.partner);
        setEditName(data.partner.name);
        setEditEmail(data.partner.contactEmail);
        setEditPaymentModel(data.partner.paymentModel);
      }
    } catch (error) {
      console.error('Failed to fetch partner:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartner();
  }, [id]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const response = await fetch(`/admin/api/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          contactEmail: editEmail,
          paymentModel: editPaymentModel,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setIsEditing(false);
        fetchPartner();
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) return;
    setGeneratingKey(true);
    try {
      const response = await fetch(`/admin/api/partners/${id}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName,
          scopes: ['discovery', 'booking', 'payment'],
        }),
      });
      const data = await response.json();
      if (data.success) {
        setNewKeyDisplay(data.apiKey.key);
        setShowKeyForm(false);
        setNewKeyName('');
        fetchPartner();
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Revoke this API key? Clients using it will immediately lose access.')) return;
    setRevoking(keyId);
    try {
      await fetch(`/admin/api/partners/${id}/api-keys`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      fetchPartner();
    } finally {
      setRevoking(null);
    }
  };

  const handleSuspend = async () => {
    if (!confirm('Suspend this partner? All API keys will be deactivated.')) return;
    await fetch(`/admin/api/partners/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUSPENDED' }),
    });
    fetchPartner();
  };

  const handleActivate = async () => {
    await fetch(`/admin/api/partners/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    fetchPartner();
  };

  const handleArchive = async () => {
    if (!confirm('Archive this partner? This cannot be undone easily.')) return;
    await fetch(`/admin/api/partners/${id}`, { method: 'DELETE' });
    router.push('/partners');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading partner...</div>;
  }

  if (!partner) {
    return <div className="text-center py-12 text-slate-500">Partner not found</div>;
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    SUSPENDED: 'bg-amber-100 text-amber-700',
    ARCHIVED: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/partners')}
            className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block"
          >
            &larr; Back to Partners
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{partner.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[partner.status] ?? ''}`}>
              {partner.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {partner.status === 'ACTIVE' && (
            <button onClick={handleSuspend} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 text-sm">
              Suspend
            </button>
          )}
          {partner.status === 'SUSPENDED' && (
            <button onClick={handleActivate} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 text-sm">
              Activate
            </button>
          )}
          {partner.status !== 'ARCHIVED' && (
            <button onClick={handleArchive} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">
              Archive
            </button>
          )}
        </div>
      </div>

      {/* New Key Alert */}
      {newKeyDisplay && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-emerald-800">New API Key Generated</h3>
              <p className="text-emerald-600 mt-1 text-sm">Copy this key now. It will not be shown again.</p>
            </div>
            <button onClick={() => setNewKeyDisplay(null)} className="text-emerald-400 hover:text-emerald-600">x</button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <code className="flex-1 bg-white border border-emerald-300 rounded px-4 py-3 font-mono text-sm text-slate-800 select-all">
              {newKeyDisplay}
            </code>
            <button
              onClick={() => copyToClipboard(newKeyDisplay)}
              className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Partner Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Partner Details</h2>
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="text-sm text-sky-600 hover:text-sky-700">
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleUpdate} disabled={updating} className="text-sm px-3 py-1 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">
                  {updating ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setIsEditing(false)} className="text-sm px-3 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Name</span>
              {isEditing ? (
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
              ) : (
                <p className="font-medium text-slate-900 mt-0.5">{partner.name}</p>
              )}
            </div>
            <div>
              <span className="text-slate-500">Contact Email</span>
              {isEditing ? (
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
              ) : (
                <p className="font-medium text-slate-900 mt-0.5">{partner.contactEmail}</p>
              )}
            </div>
            <div>
              <span className="text-slate-500">Holibob Partner ID</span>
              <p className="font-medium text-slate-900 mt-0.5">{partner.holibobPartnerId}</p>
            </div>
            <div>
              <span className="text-slate-500">Payment Model</span>
              {isEditing ? (
                <select value={editPaymentModel} onChange={(e) => setEditPaymentModel(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg">
                  <option value="REQUIRED">Required (Consumer Pays)</option>
                  <option value="ON_ACCOUNT">On Account (Partner Billed)</option>
                </select>
              ) : (
                <p className="font-medium text-slate-900 mt-0.5">
                  {partner.paymentModel === 'ON_ACCOUNT' ? 'On Account' : 'Consumer Pays'}
                </p>
              )}
            </div>
            <div>
              <span className="text-slate-500">Holibob API Key</span>
              <p className="font-mono text-slate-600 mt-0.5">{partner.holibobApiKey}</p>
            </div>
            <div>
              <span className="text-slate-500">Holibob API Secret</span>
              <p className="font-mono text-slate-600 mt-0.5">{partner.holibobApiSecret ?? 'Not configured'}</p>
            </div>
            <div>
              <span className="text-slate-500">API URL</span>
              <p className="font-mono text-xs text-slate-600 mt-0.5">{partner.holibobApiUrl}</p>
            </div>
            <div>
              <span className="text-slate-500">Created</span>
              <p className="text-slate-900 mt-0.5">{new Date(partner.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">MCP API Keys</h2>
            {partner.status === 'ACTIVE' && (
              <button
                onClick={() => setShowKeyForm(true)}
                className="px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium"
              >
                + Generate Key
              </button>
            )}
          </div>

          {/* Generate key form */}
          {showKeyForm && (
            <div className="mb-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Key Name</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production, Staging, Development"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  onClick={handleGenerateKey}
                  disabled={generatingKey || !newKeyName.trim()}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 text-sm font-medium"
                >
                  {generatingKey ? 'Generating...' : 'Generate'}
                </button>
                <button
                  onClick={() => { setShowKeyForm(false); setNewKeyName(''); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Keys table */}
          {partner.mcpApiKeys.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">No API keys issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Name</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Key</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Scopes</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Rate Limit</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Status</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Last Used</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Created</th>
                    <th className="text-right py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {partner.mcpApiKeys.map((apiKey) => (
                    <tr key={apiKey.id} className={`border-b border-slate-100 ${!apiKey.isActive ? 'opacity-50' : ''}`}>
                      <td className="py-3 px-2 font-medium text-slate-900">{apiKey.name}</td>
                      <td className="py-3 px-2 font-mono text-xs text-slate-500">{apiKey.key}</td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1">
                          {apiKey.scopes.map((s) => (
                            <span key={s} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-slate-600">{apiKey.rateLimitRpm}/min</td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${apiKey.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {apiKey.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-500">
                        {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-3 px-2 text-slate-500">
                        {new Date(apiKey.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {apiKey.isActive && (
                          <button
                            onClick={() => handleRevokeKey(apiKey.id)}
                            disabled={revoking === apiKey.id}
                            className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                          >
                            {revoking === apiKey.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MCP Connection Details */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">MCP Connection Details</h2>
          <p className="text-sm text-slate-500 mb-4">
            Use these credentials to connect via Claude Desktop (Settings &rarr; Connectors), ChatGPT, or any MCP client.
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
              <span className="text-sm text-slate-500 min-w-[140px]">Server URL</span>
              <code className="flex-1 font-mono text-xs text-slate-800 select-all">https://holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com/mcp/sse</code>
              <button onClick={() => copyToClipboard('https://holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com/mcp/sse')} className="text-sky-600 hover:text-sky-700 text-xs font-medium whitespace-nowrap">Copy</button>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
              <span className="text-sm text-slate-500 min-w-[140px]">OAuth Client ID</span>
              <code className="flex-1 font-mono text-xs text-slate-800 select-all">{partner.id}</code>
              <button onClick={() => copyToClipboard(partner.id)} className="text-sky-600 hover:text-sky-700 text-xs font-medium whitespace-nowrap">Copy</button>
            </div>
            <div className="flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-lg p-3">
              <span className="text-sm text-slate-500 min-w-[140px]">OAuth Client Secret</span>
              <span className="flex-1 text-xs text-slate-600">Use the MCP API key (<code className="bg-white px-1 py-0.5 rounded">mcp_live_...</code>) shown when this partner was created</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
