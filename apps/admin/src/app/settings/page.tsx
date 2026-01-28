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

  const handleSave = async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaved(true);
    setHasChanges(false);
    setTimeout(() => setSaved(false), 3000);
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
        </div>
      </div>
    </div>
  );
}
