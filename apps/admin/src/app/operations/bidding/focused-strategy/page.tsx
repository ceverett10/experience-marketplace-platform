'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';

// ============================================================================
// Types
// ============================================================================

interface CategoryScore {
  category: string;
  productCount: number;
  avgPrice: number;
  searchVolume: number;
  avgCpc: number;
  predictedRoas: number;
  comboScore: number;
}

interface CityScore {
  city: string;
  score: number;
  searchVolume: number;
  avgCpc: number;
  revenue: number;
  productCount: number;
  categoryCount: number;
  gscImpressions: number;
  categories: CategoryScore[];
}

interface SelectionData {
  cities: CityScore[];
  existingConfig: {
    id: string;
    isActive: boolean;
    combinations: Array<{ city: string; category: string; status: string }>;
    totalDailyBudget: number;
  } | null;
}

// ============================================================================
// Main Page
// ============================================================================

export default function FocusedStrategyPage() {
  const [data, setData] = useState<SelectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [selectedCombos, setSelectedCombos] = useState<Map<string, Set<string>>>(new Map());
  const [dailyBudget, setDailyBudget] = useState(150);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${basePath}/api/analytics/demand-discovery/focused-selection`);
      if (!res.ok) throw new Error('Failed to fetch selection data');
      const result: SelectionData = await res.json();
      setData(result);

      // Pre-select from existing config if active
      if (result.existingConfig?.isActive) {
        const cities = new Set<string>();
        const combos = new Map<string, Set<string>>();
        for (const c of result.existingConfig.combinations) {
          cities.add(c.city);
          if (!combos.has(c.city)) combos.set(c.city, new Set());
          combos.get(c.city)!.add(c.category);
        }
        setSelectedCities(cities);
        setSelectedCombos(combos);
        setDailyBudget(result.existingConfig.totalDailyBudget);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) {
        next.delete(city);
        setSelectedCombos((combos) => {
          const nextCombos = new Map(combos);
          nextCombos.delete(city);
          return nextCombos;
        });
      } else {
        if (next.size >= 5) return prev;
        next.add(city);
        // Auto-select top 5 categories
        const cityData = data?.cities.find((c) => c.city === city);
        if (cityData) {
          const topCats = new Set(cityData.categories.slice(0, 5).map((c) => c.category));
          setSelectedCombos((combos) => new Map(combos).set(city, topCats));
        }
      }
      return next;
    });
  };

  const toggleCategory = (city: string, category: string) => {
    setSelectedCombos((prev) => {
      const next = new Map(prev);
      const cats = new Set(next.get(city) || []);
      if (cats.has(category)) {
        cats.delete(category);
      } else {
        if (cats.size >= 5) return prev;
        cats.add(category);
      }
      next.set(city, cats);
      return next;
    });
  };

  const totalCombos = Array.from(selectedCombos.values()).reduce((s, cats) => s + cats.size, 0);

  const handleSave = async () => {
    const combinations: Array<{ city: string; category: string }> = [];
    for (const [city, cats] of selectedCombos) {
      for (const cat of cats) {
        combinations.push({ city, category: cat });
      }
    }

    if (combinations.length === 0) return;

    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`${basePath}/api/analytics/demand-discovery/focused-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combinations, totalDailyBudget: dailyBudget }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveResult(
          `Error: ${result.error}${result.details ? ' — ' + result.details.join(', ') : ''}`
        );
      } else {
        setSaveResult(`Strategy locked with ${combinations.length} combinations`);
      }
    } catch {
      setSaveResult('Failed to save strategy');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/operations/bidding" className="hover:text-sky-600">
            Paid Traffic
          </Link>
          <span>/</span>
          <span>Focused Strategy</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Focused Strategy Setup</h1>
        <p className="text-slate-500 mt-1">
          Select top 5 destinations and 5 experience types per destination (max 25 combinations)
        </p>
      </div>

      {/* Existing config warning */}
      {data?.existingConfig?.isActive && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            An active focused strategy exists with {data.existingConfig.combinations.length}{' '}
            combinations. Saving will replace it.
          </p>
        </div>
      )}

      {/* Budget config */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Total Daily Budget
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">£</span>
                <input
                  type="number"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(Number(e.target.value))}
                  className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  min={10}
                  max={1200}
                />
              </div>
            </div>
            <div className="text-sm text-slate-500">
              <p>
                Selected: <span className="font-medium text-slate-900">{totalCombos}</span>{' '}
                combinations
              </p>
              <p>
                Per combo:{' '}
                <span className="font-medium text-slate-900">
                  £{totalCombos > 0 ? (dailyBudget / totalCombos).toFixed(2) : '0.00'}
                </span>
                /day
              </p>
            </div>
            <div className="ml-auto">
              <button
                onClick={handleSave}
                disabled={saving || totalCombos === 0}
                className="px-6 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Lock & Activate'}
              </button>
            </div>
          </div>
          {saveResult && (
            <p
              className={`mt-3 text-sm ${saveResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}
            >
              {saveResult}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 1: Select Cities */}
      <Card>
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">
            Step 1: Select Top 5 Destinations{' '}
            <span className="text-slate-400 font-normal">({selectedCities.size}/5 selected)</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3 w-8" />
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  City
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Score
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Products
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Search Vol
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Avg CPC
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Revenue (90d)
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  GSC Impressions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.cities || []).map((city) => {
                const isSelected = selectedCities.has(city.city);
                return (
                  <tr
                    key={city.city}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                    onClick={() => toggleCity(city.city)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCity(city.city)}
                        className="rounded border-slate-300"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-900">{city.city}</span>
                      <p className="text-xs text-slate-400">{city.categoryCount} categories</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${city.score >= 70 ? 'bg-green-100 text-green-700' : city.score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {city.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {city.productCount}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {city.searchVolume.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      £{city.avgCpc.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {city.revenue > 0 ? `£${city.revenue.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {city.gscImpressions.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Step 2: Select Categories per City */}
      {Array.from(selectedCities).map((cityName) => {
        const cityData = data?.cities.find((c) => c.city === cityName);
        if (!cityData) return null;
        const selectedCats = selectedCombos.get(cityName) || new Set();

        return (
          <Card key={cityName}>
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">
                Step 2: Experiences in {cityName}{' '}
                <span className="text-slate-400 font-normal">({selectedCats.size}/5 selected)</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3 w-8" />
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Category
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Score
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Products
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Search Vol
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      CPC
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Predicted ROAS
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Avg Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cityData.categories.map((cat) => {
                    const isSelected = selectedCats.has(cat.category);
                    return (
                      <tr
                        key={cat.category}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                        onClick={() => toggleCategory(cityName, cat.category)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCategory(cityName, cat.category)}
                            className="rounded border-slate-300"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {cat.category}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${cat.comboScore >= 70 ? 'bg-green-100 text-green-700' : cat.comboScore >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}
                          >
                            {cat.comboScore}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">
                          {cat.productCount}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">
                          {cat.searchVolume.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">
                          £{cat.avgCpc.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${cat.predictedRoas >= 2 ? 'bg-green-100 text-green-700' : cat.predictedRoas >= 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}
                          >
                            {cat.predictedRoas.toFixed(1)}x
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">
                          £{cat.avgPrice}
                        </td>
                      </tr>
                    );
                  })}
                  {cityData.categories.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No eligible categories (min 3 products required)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {/* Summary */}
      {totalCombos > 0 && (
        <Card>
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Selected Combinations ({totalCombos})</h2>
          </div>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              {Array.from(selectedCombos.entries()).flatMap(([city, cats]) =>
                Array.from(cats).map((cat) => (
                  <span
                    key={`${city}-${cat}`}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-800 rounded-full text-xs font-medium"
                  >
                    {cat} in {city}
                    <button
                      onClick={() => toggleCategory(city, cat)}
                      className="ml-1 text-sky-600 hover:text-sky-800"
                    >
                      x
                    </button>
                  </span>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
