'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from '@experience-marketplace/ui-components';

interface PlatformSettings {
  branding: {
    platformName: string;
    primaryColor: string;
    secondaryColor: string;
  };
  domains: {
    storefrontDomain: string;
    apiDomain: string;
  };
  commissions: {
    defaultRate: number;
    minPayoutAmount: number;
    payoutCurrency: string;
  };
  features: {
    aiContentGeneration: boolean;
    autoPublish: boolean;
    analyticsEnabled: boolean;
    maintenanceMode: boolean;
  };
}

const defaultSettings: PlatformSettings = {
  branding: {
    platformName: 'Experience Marketplace',
    primaryColor: '#0ea5e9',
    secondaryColor: '#06b6d4',
  },
  domains: {
    storefrontDomain: 'v3.experiences.holibob.tech',
    apiDomain: 'api.holibob.com',
  },
  commissions: {
    defaultRate: 12,
    minPayoutAmount: 50,
    payoutCurrency: 'GBP',
  },
  features: {
    aiContentGeneration: true,
    autoPublish: false,
    analyticsEnabled: true,
    maintenanceMode: false,
  },
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState('branding');
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Autonomous Controls State
  const [autonomousState, setAutonomousState] = useState({
    allProcessesPaused: false,
    enableSiteCreation: true,
    enableContentGeneration: true,
    enableGSCVerification: true,
    enableContentOptimization: true,
    enableABTesting: true,
    maxTotalSites: 200,
    maxSitesPerHour: 10,
    maxContentPagesPerHour: 100,
    maxGSCRequestsPerHour: 200,
    maxOpportunityScansPerDay: 50,
  });
  const [pauseLoading, setPauseLoading] = useState(false);

  const handleSave = async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaved(true);
    setHasChanges(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleEmergencyStop = async () => {
    setPauseLoading(true);
    try {
      const endpoint = autonomousState.allProcessesPaused
        ? '/api/settings/resume-all'
        : '/api/settings/pause-all';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pausedBy: 'admin_user',
          pauseReason: autonomousState.allProcessesPaused
            ? undefined
            : 'Manual emergency stop from admin dashboard',
        }),
      });

      if (response.ok) {
        setAutonomousState((prev) => ({
          ...prev,
          allProcessesPaused: !prev.allProcessesPaused,
        }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to toggle pause state:', error);
    } finally {
      setPauseLoading(false);
    }
  };

  const updateAutonomousSettings = async (updates: Partial<typeof autonomousState>) => {
    try {
      const response = await fetch('/api/settings/autonomous', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        setAutonomousState((prev) => ({ ...prev, ...updates }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to update autonomous settings:', error);
    }
  };

  const updateSettings = <K extends keyof PlatformSettings>(
    category: K,
    field: keyof PlatformSettings[K],
    value: PlatformSettings[K][keyof PlatformSettings[K]]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const tabs = [
    { id: 'branding', label: 'Branding', icon: '🎨' },
    { id: 'domains', label: 'Domains', icon: '🌐' },
    { id: 'commissions', label: 'Commissions', icon: '💰' },
    { id: 'features', label: 'Features', icon: '⚡' },
    { id: 'autonomous', label: 'Autonomous Controls', icon: '🤖' },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
          <p className="text-slate-500 mt-1">
            Configure global settings for the Experience Marketplace
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`px-4 py-2 rounded-lg font-medium ${hasChanges ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-slate-200 text-slate-500'}`}
        >
          💾 {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <span>✅</span>
          <span className="text-green-800">Settings have been saved successfully.</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 flex-shrink-0">
          <Card>
            <CardContent className="p-2">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-sky-50 text-sky-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          {/* Branding Settings */}
          {activeTab === 'branding' && (
            <Card>
              <CardHeader>
                <CardTitle>Branding Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Platform Name
                  </label>
                  <input
                    type="text"
                    value={settings.branding.platformName}
                    onChange={(e) => updateSettings('branding', 'platformName', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-10 w-10 rounded-lg border border-slate-300"
                        style={{ backgroundColor: settings.branding.primaryColor }}
                      />
                      <input
                        type="text"
                        value={settings.branding.primaryColor}
                        onChange={(e) => updateSettings('branding', 'primaryColor', e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Secondary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-10 w-10 rounded-lg border border-slate-300"
                        style={{ backgroundColor: settings.branding.secondaryColor }}
                      />
                      <input
                        type="text"
                        value={settings.branding.secondaryColor}
                        onChange={(e) =>
                          updateSettings('branding', 'secondaryColor', e.target.value)
                        }
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Domains Settings */}
          {activeTab === 'domains' && (
            <Card>
              <CardHeader>
                <CardTitle>Domain Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span>🔒</span>
                    <span className="font-medium text-sky-900">SSL Enabled</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded ml-auto">
                      Active
                    </span>
                  </div>
                  <p className="text-sm text-sky-700">
                    All domains are secured with SSL certificates
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Storefront Domain
                    </label>
                    <input
                      type="text"
                      value={settings.domains.storefrontDomain}
                      onChange={(e) =>
                        updateSettings('domains', 'storefrontDomain', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Base domain for storefronts (e.g., site-name.
                      {settings.domains.storefrontDomain})
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      API Domain
                    </label>
                    <input
                      type="text"
                      value={settings.domains.apiDomain}
                      onChange={(e) => updateSettings('domains', 'apiDomain', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Commissions Settings */}
          {activeTab === 'commissions' && (
            <Card>
              <CardHeader>
                <CardTitle>Commission Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Default Commission Rate
                    </label>
                    <div className="relative w-32">
                      <input
                        type="number"
                        value={settings.commissions.defaultRate}
                        onChange={(e) =>
                          updateSettings('commissions', 'defaultRate', Number(e.target.value))
                        }
                        className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Minimum Payout Amount
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                          £
                        </span>
                        <input
                          type="number"
                          value={settings.commissions.minPayoutAmount}
                          onChange={(e) =>
                            updateSettings('commissions', 'minPayoutAmount', Number(e.target.value))
                          }
                          className="w-full px-3 py-2 pl-8 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Payout Currency
                      </label>
                      <select
                        value={settings.commissions.payoutCurrency}
                        onChange={(e) =>
                          updateSettings('commissions', 'payoutCurrency', e.target.value)
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="GBP">GBP (£)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Features Settings */}
          {activeTab === 'features' && (
            <Card>
              <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  {
                    id: 'aiContentGeneration',
                    label: 'AI Content Generation',
                    desc: 'Enable AI-powered content generation for storefronts',
                    enabled: settings.features.aiContentGeneration,
                  },
                  {
                    id: 'autoPublish',
                    label: 'Auto-Publish Content',
                    desc: 'Automatically publish approved content without manual review',
                    enabled: settings.features.autoPublish,
                    warning: true,
                  },
                  {
                    id: 'analyticsEnabled',
                    label: 'Analytics Tracking',
                    desc: 'Track page views, clicks, and conversions',
                    enabled: settings.features.analyticsEnabled,
                  },
                  {
                    id: 'maintenanceMode',
                    label: 'Maintenance Mode',
                    desc: 'Show maintenance page to all visitors',
                    enabled: settings.features.maintenanceMode,
                    danger: true,
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between py-4 border-b border-slate-100 last:border-0 ${
                      item.danger && item.enabled ? 'bg-red-50 -mx-6 px-6 rounded-lg' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{item.label}</p>
                        {item.warning && (
                          <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded">
                            Caution
                          </span>
                        )}
                        {item.danger && (
                          <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded">
                            Dangerous
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) =>
                          updateSettings(
                            'features',
                            item.id as keyof PlatformSettings['features'],
                            e.target.checked
                          )
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Autonomous Controls */}
          {activeTab === 'autonomous' && (
            <div className="space-y-6">
              {/* Emergency Stop Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Emergency Stop</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`p-6 rounded-lg border-2 ${
                      autonomousState.allProcessesPaused
                        ? 'bg-red-50 border-red-200'
                        : 'bg-green-50 border-green-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">
                            {autonomousState.allProcessesPaused ? '⏸️' : '▶️'}
                          </span>
                          <h3 className="text-lg font-semibold">
                            {autonomousState.allProcessesPaused
                              ? 'All Autonomous Processes Paused'
                              : 'Autonomous Processes Running'}
                          </h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                          {autonomousState.allProcessesPaused
                            ? 'All autonomous operations across the entire platform are currently stopped. Site creation, content generation, GSC verification, and optimization jobs are paused.'
                            : 'The platform is operating normally. All autonomous processes are active and running according to configured schedules and triggers.'}
                        </p>
                        <Button
                          onClick={handleEmergencyStop}
                          disabled={pauseLoading}
                          className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                            autonomousState.allProcessesPaused
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-red-600 hover:bg-red-700'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {pauseLoading
                            ? 'Processing...'
                            : autonomousState.allProcessesPaused
                              ? '▶️ Resume All Processes'
                              : '⏸️ Pause All Processes'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Feature Flags Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Autonomous Feature Flags</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      key: 'enableSiteCreation',
                      label: 'Site Creation',
                      description: 'Allow autonomous creation of new sites based on opportunities',
                    },
                    {
                      key: 'enableContentGeneration',
                      label: 'Content Generation',
                      description: 'Enable AI-powered content generation for pages',
                    },
                    {
                      key: 'enableGSCVerification',
                      label: 'GSC Verification',
                      description: 'Automatically verify sites with Google Search Console',
                    },
                    {
                      key: 'enableContentOptimization',
                      label: 'Content Optimization',
                      description: 'Trigger automatic content improvements based on performance',
                    },
                    {
                      key: 'enableABTesting',
                      label: 'A/B Testing',
                      description: 'Run autonomous A/B tests and apply winning variants',
                    },
                  ].map((feature) => (
                    <div
                      key={feature.key}
                      className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{feature.label}</p>
                        <p className="text-sm text-slate-500">{feature.description}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            autonomousState[feature.key as keyof typeof autonomousState] as boolean
                          }
                          onChange={(e) =>
                            updateAutonomousSettings({ [feature.key]: e.target.checked })
                          }
                          disabled={autonomousState.allProcessesPaused}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 peer-disabled:opacity-50"></div>
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Rate Limits Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Rate Limits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Max Total Sites
                      </label>
                      <input
                        type="number"
                        value={autonomousState.maxTotalSites}
                        onChange={(e) =>
                          updateAutonomousSettings({ maxTotalSites: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Maximum total sites allowed on platform
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Sites Per Hour
                      </label>
                      <input
                        type="number"
                        value={autonomousState.maxSitesPerHour}
                        onChange={(e) =>
                          updateAutonomousSettings({ maxSitesPerHour: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">Maximum sites created per hour</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Content Pages Per Hour
                      </label>
                      <input
                        type="number"
                        value={autonomousState.maxContentPagesPerHour}
                        onChange={(e) =>
                          updateAutonomousSettings({
                            maxContentPagesPerHour: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Maximum content pages generated per hour
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        GSC Requests Per Hour
                      </label>
                      <input
                        type="number"
                        value={autonomousState.maxGSCRequestsPerHour}
                        onChange={(e) =>
                          updateAutonomousSettings({
                            maxGSCRequestsPerHour: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Maximum GSC API requests per hour
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Opportunity Scans Per Day
                      </label>
                      <input
                        type="number"
                        value={autonomousState.maxOpportunityScansPerDay}
                        onChange={(e) =>
                          updateAutonomousSettings({
                            maxOpportunityScansPerDay: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Maximum opportunity scans per day
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
                    <div className="flex items-start gap-3">
                      <span className="text-amber-600">⚠️</span>
                      <div className="text-sm text-amber-800">
                        <p className="font-medium mb-1">Rate Limit Safety</p>
                        <p>
                          These limits prevent runaway operations and manage infrastructure costs. All
                          autonomous workers respect these limits before executing operations.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
