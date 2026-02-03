'use client';

import { useState } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

export default function DebugPage() {
  const [domain, setDomain] = useState('london-food-tours.com');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleDiagnose = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `/admin/api/debug/domain-mapping?domain=${encodeURIComponent(domain)}`
      );
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: 'Failed to diagnose', details: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (dryRun: boolean) => {
    setLoading(true);

    try {
      const response = await fetch('/admin/api/debug/fix-content-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, dryRun }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: 'Failed to fix', details: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Content Mapping Debugger</h1>
      <p className="text-slate-600 mb-8">
        Diagnose and fix issues with domain → site → page → content mappings
      </p>

      <Card className="mb-8">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-1">Domain Checker</h2>
          <p className="text-sm text-slate-500 mb-4">
            Enter a domain to check its mapping and content configuration
          </p>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g., london-food-tours.com"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleDiagnose}
              disabled={loading || !domain}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {loading ? 'Checking...' : 'Diagnose'}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleFix(true)}
              disabled={loading || !domain}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
            >
              {loading ? 'Processing...' : 'Dry Run Fix'}
            </button>
            <button
              onClick={() => handleFix(false)}
              disabled={loading || !domain}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
            >
              {loading ? 'Processing...' : 'Apply Fix'}
            </button>
          </div>

          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <p className="font-medium text-slate-700 mb-2">What this tool does:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>
                <strong>Diagnose:</strong> Shows the current mapping status and identifies issues
              </li>
              <li>
                <strong>Dry Run Fix:</strong> Shows what would be fixed without making changes
              </li>
              <li>
                <strong>Apply Fix:</strong> Automatically fixes domain mapping, creates missing
                pages, and links content
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              {result.success === true && '✅ Success'}
              {result.success === false && '❌ Issues Found'}
              {result.success === undefined && '📊 Diagnostic Results'}
            </h2>
            <pre className="bg-slate-900 text-slate-100 p-6 rounded-lg overflow-auto text-sm leading-relaxed max-h-[600px]">
              {JSON.stringify(result, null, 2)}
            </pre>

            {result.fixes && (
              <div className="mt-4 space-y-2">
                <h3 className="font-semibold text-slate-900">Action Log:</h3>
                {result.fixes.map((fix: string, idx: number) => (
                  <div
                    key={idx}
                    className={`p-2 rounded text-sm ${
                      fix.startsWith('✅')
                        ? 'bg-green-50 text-green-800'
                        : fix.startsWith('❌')
                          ? 'bg-red-50 text-red-800'
                          : fix.startsWith('⚠️')
                            ? 'bg-amber-50 text-amber-800'
                            : fix.startsWith('💡')
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    {fix}
                  </div>
                ))}
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="font-semibold text-red-900">Errors:</h3>
                {result.errors.map((error: string, idx: number) => (
                  <div key={idx} className="p-2 rounded text-sm bg-red-50 text-red-800">
                    {error}
                  </div>
                ))}
              </div>
            )}

            {result.nextSteps && (
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                <h3 className="font-semibold text-indigo-900 mb-2">Next Steps:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-indigo-800">
                  {result.nextSteps.map((step: string, idx: number) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.domainRecord && (
              <div className="mt-4">
                <h3 className="font-semibold text-slate-900 mb-2">Domain Status:</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-600">Found:</span>
                    <span
                      className={`px-2 py-1 rounded ${result.domainRecord.found ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {result.domainRecord.found ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {result.domainRecord.site && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-600">Site:</span>
                        <span className="text-slate-900">{result.domainRecord.site.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-600">Privacy Page:</span>
                        <span
                          className={`px-2 py-1 rounded ${result.domainRecord.site.privacyPage ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                        >
                          {result.domainRecord.site.privacyPage ? 'Exists' : 'Missing'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {result.allSites && result.allSites.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold text-slate-900 mb-2">
                  All Sites ({result.allSites.length}):
                </h3>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {result.allSites.map((site: any) => (
                    <div key={site.id} className="p-2 bg-slate-50 rounded text-sm">
                      <div className="font-medium text-slate-900">{site.name}</div>
                      <div className="text-slate-600">
                        Slug: {site.slug} | Status: {site.status}
                      </div>
                      {site.domains && site.domains.length > 0 && (
                        <div className="text-slate-500 text-xs mt-1">
                          Domains: {site.domains.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
