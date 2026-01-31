'use client';

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBrand } from '@/lib/site-context';

interface ProductDiscoverySearchProps {
  variant?: 'hero' | 'inline' | 'sidebar';
  defaultDestination?: string;
  defaultDates?: { startDate?: string; endDate?: string };
  defaultTravelers?: string;
  recommendedTags?: { id: string; name: string }[];
  popularSearchTerms?: string[];
  onSearch?: (params: SearchParams) => void;
  onResultsChange?: (results: SearchResult[]) => void;
  className?: string;
}

interface SearchParams {
  destination: string;
  when?: string;
  who?: string;
  what?: string;
  startDate?: string;
  endDate?: string;
  adults?: number;
  children?: number;
}

interface SearchResult {
  id: string;
  title: string;
  imageUrl: string;
  price: { amount: number; formatted: string };
  rating?: { average: number; count: number };
}

// API Suggestions Response
interface SuggestionsResponse {
  destination: { id: string; name: string } | null;
  destinations: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  searchTerms: string[];
}

// Default fallback suggestions (used before API response)
const DEFAULT_LOCATION_SUGGESTIONS = [
  { id: 'london', name: 'London' },
  { id: 'paris', name: 'Paris' },
  { id: 'barcelona', name: 'Barcelona' },
  { id: 'rome', name: 'Rome' },
  { id: 'amsterdam', name: 'Amsterdam' },
  { id: 'edinburgh', name: 'Edinburgh' },
];

// When suggestions (static - dates are deterministic)
const WHEN_SUGGESTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this-weekend', label: 'This Weekend' },
  { id: 'next-week', label: 'Next Week' },
  { id: 'next-month', label: 'Next Month' },
];

// Who suggestions (static - traveler types are fixed)
const WHO_SUGGESTIONS = [
  { id: 'solo', label: 'Solo Traveller' },
  { id: 'couple', label: 'Couple' },
  { id: 'family', label: 'Family with Kids' },
  { id: 'friends', label: 'Group of Friends' },
  { id: 'business', label: 'Business Trip' },
];

// Default "What" suggestions (fallback before API)
const DEFAULT_WHAT_SUGGESTIONS = [
  { id: 'tours', label: 'Walking Tours' },
  { id: 'food', label: 'Food & Drink' },
  { id: 'museums', label: 'Museums' },
  { id: 'outdoor', label: 'Outdoor Activities' },
  { id: 'day-trips', label: 'Day Trips' },
];

type ActiveSection = 'where' | 'when' | 'who' | 'what' | null;

export function ProductDiscoverySearch({
  variant = 'hero',
  defaultDestination = '',
  defaultDates: _defaultDates = {},
  onSearch,
  onResultsChange: _onResultsChange,
  className = '',
}: ProductDiscoverySearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const brand = useBrand();
  const searchBarRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Search state
  const [where, setWhere] = useState(defaultDestination || searchParams.get('destination') || '');
  const [when, setWhen] = useState(searchParams.get('when') || '');
  const [who, setWho] = useState(searchParams.get('who') || '');
  const [what, setWhat] = useState(searchParams.get('q') || '');

  // UI state
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // API-driven suggestions state
  const [apiSuggestions, setApiSuggestions] = useState<SuggestionsResponse>({
    destination: null,
    destinations: [],
    tags: [],
    searchTerms: [],
  });

  // Parse "when" into date parameters for API
  const parseWhenToDates = useCallback(
    (whenValue: string): { startDate?: string; endDate?: string } => {
      const today = new Date();
      const formatDate = (date: Date) => date.toISOString().split('T')[0] ?? '';
      const whenLower = whenValue.toLowerCase();

      if (whenLower === 'today') {
        return { startDate: formatDate(today) };
      } else if (whenLower === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { startDate: formatDate(tomorrow) };
      } else if (whenLower === 'this weekend' || whenLower.includes('weekend')) {
        const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
        const saturday = new Date(today);
        saturday.setDate(today.getDate() + daysUntilSaturday);
        const sunday = new Date(saturday);
        sunday.setDate(saturday.getDate() + 1);
        return { startDate: formatDate(saturday), endDate: formatDate(sunday) };
      } else if (whenLower === 'next week') {
        const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        const nextSunday = new Date(nextMonday);
        nextSunday.setDate(nextMonday.getDate() + 6);
        return { startDate: formatDate(nextMonday), endDate: formatDate(nextSunday) };
      } else if (whenLower === 'next month') {
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const lastDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        return { startDate: formatDate(nextMonth), endDate: formatDate(lastDayNextMonth) };
      }
      return {};
    },
    []
  );

  // Parse "who" into adults/children for API
  const parseWhoToTravelers = useCallback(
    (whoValue: string): { adults?: number; children?: number } => {
      const whoLower = whoValue.toLowerCase();
      const adultsMatch = whoValue.match(/(\d+)\s*adult/i);
      const childrenMatch = whoValue.match(/(\d+)\s*child/i);

      if (adultsMatch?.[1]) {
        const result: { adults: number; children?: number } = {
          adults: parseInt(adultsMatch[1], 10),
        };
        if (childrenMatch?.[1]) result.children = parseInt(childrenMatch[1], 10);
        return result;
      } else if (whoLower.includes('solo') || whoLower === 'solo traveller') {
        return { adults: 1 };
      } else if (whoLower === 'couple') {
        return { adults: 2 };
      } else if (whoLower.includes('family') || whoLower === 'family with kids') {
        return { adults: 2, children: 2 };
      } else if (whoLower.includes('friends') || whoLower === 'group of friends') {
        return { adults: 4 };
      } else if (whoLower.includes('business') || whoLower === 'business trip') {
        return { adults: 1 };
      }
      return {};
    },
    []
  );

  // Fetch suggestions from API - triggered by where and what inputs
  // Note: Date and traveler parameters are NOT passed to suggestions API
  // because Holibob's productDiscovery returns empty suggestions when dates are included.
  // Suggestions should be context-aware based on location/search, not filtered by availability.
  const fetchSuggestions = useCallback(async () => {
    // Only fetch if we have location or search input
    if (!where && !what) {
      setApiSuggestions({ destination: null, destinations: [], tags: [], searchTerms: [] });
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const params = new URLSearchParams();
      if (where) params.set('where', where);
      if (what) params.set('what', what);

      // Note: We intentionally don't pass date/traveler params to suggestions
      // as they cause the API to return empty results. These params are only
      // used for the actual product search, not for suggestions.

      const response = await fetch(`/api/suggestions?${params.toString()}`);
      if (response.ok) {
        const data: SuggestionsResponse = await response.json();
        setApiSuggestions(data);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [where, what]);

  // Debounced suggestions fetch (300ms delay) - triggered by where and what inputs
  useEffect(() => {
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }

    suggestionsDebounceRef.current = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => {
      if (suggestionsDebounceRef.current) {
        clearTimeout(suggestionsDebounceRef.current);
      }
    };
  }, [where, what, fetchSuggestions]);

  // Get location suggestions - use API destinations array (like Holibob Hub)
  const getLocationSuggestions = useCallback(() => {
    // If API returned destination suggestions, use them (this is what Holibob Hub does)
    if (apiSuggestions.destinations.length > 0) {
      return apiSuggestions.destinations;
    }

    // If only selected destination is available, show it first along with defaults
    const suggestions = [...DEFAULT_LOCATION_SUGGESTIONS];
    if (
      apiSuggestions.destination &&
      !suggestions.find((s) => s.id === apiSuggestions.destination?.id)
    ) {
      suggestions.unshift(apiSuggestions.destination);
    }

    // Filter by input
    if (where) {
      return suggestions.filter((loc) => loc.name.toLowerCase().includes(where.toLowerCase()));
    }
    return suggestions;
  }, [where, apiSuggestions.destinations, apiSuggestions.destination]);

  // Get "What" suggestions - prefer API tags and search terms
  const getWhatSuggestions = useCallback((): { id: string; label: string }[] => {
    // If we have API suggestions, use them
    if (apiSuggestions.tags.length > 0 || apiSuggestions.searchTerms.length > 0) {
      const suggestions: { id: string; label: string }[] = [];

      // Add tags from API
      apiSuggestions.tags.forEach((tag) => {
        suggestions.push({ id: tag.id, label: tag.name });
      });

      // Add search terms from API
      apiSuggestions.searchTerms.forEach((term, index) => {
        suggestions.push({ id: `search-${index}`, label: term });
      });

      return suggestions.slice(0, 8); // Limit to 8 suggestions
    }

    // Fallback to default suggestions
    return DEFAULT_WHAT_SUGGESTIONS;
  }, [apiSuggestions.tags, apiSuggestions.searchTerms]);

  const primaryColor = brand?.primaryColor ?? '#0F766E';

  // Real-time search with debouncing
  const performSearch = useCallback(() => {
    const params: SearchParams = {
      destination: where,
      when: when || undefined,
      who: who || undefined,
      what: what || undefined,
    };

    // Parse "who" into adults/children if numeric format detected
    const whoMatch = who.match(/(\d+)\s*adult/i);
    if (whoMatch?.[1]) {
      params.adults = parseInt(whoMatch[1], 10);
    }
    const childMatch = who.match(/(\d+)\s*child/i);
    if (childMatch?.[1]) {
      params.children = parseInt(childMatch[1], 10);
    }

    // Parse "when" into dates if specific format detected
    const today = new Date();
    const formatDateString = (date: Date): string => {
      const parts = date.toISOString().split('T');
      return parts[0] ?? '';
    };
    if (when.toLowerCase() === 'today') {
      params.startDate = formatDateString(today);
    } else if (when.toLowerCase() === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      params.startDate = formatDateString(tomorrow);
    } else if (when.toLowerCase().includes('weekend')) {
      // Find next Saturday
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
      const saturday = new Date(today);
      saturday.setDate(today.getDate() + daysUntilSaturday);
      params.startDate = formatDateString(saturday);
      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      params.endDate = formatDateString(sunday);
    }

    if (onSearch) {
      onSearch(params);
    }
  }, [where, when, who, what, onSearch]);

  // Debounced search trigger
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Only trigger search if at least one field has value
    if (where || what) {
      setIsSearching(true);
      debounceRef.current = setTimeout(() => {
        performSearch();
        setIsSearching(false);
      }, 500);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [where, when, who, what, performSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        setActiveSection(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent, section: ActiveSection) => {
    if (e.key === 'Escape') {
      setActiveSection(null);
    } else if (e.key === 'Tab') {
      // Move to next section
      const sections: ActiveSection[] = ['where', 'when', 'who', 'what'];
      const currentIndex = sections.indexOf(section);
      const nextSection = sections[currentIndex + 1];
      const prevSection = sections[currentIndex - 1];
      if (!e.shiftKey && currentIndex < sections.length - 1 && nextSection) {
        e.preventDefault();
        setActiveSection(nextSection);
      } else if (e.shiftKey && currentIndex > 0 && prevSection) {
        e.preventDefault();
        setActiveSection(prevSection);
      }
    }
  };

  // Helper to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0] ?? '';
  };

  // Navigate to results page
  const navigateToResults = useCallback(() => {
    const urlParams = new URLSearchParams();
    if (where) urlParams.set('destination', where);
    if (what) urlParams.set('q', what);

    // Parse "when" into dates
    const today = new Date();
    const whenLower = when.toLowerCase();

    if (whenLower === 'today') {
      urlParams.set('startDate', formatDate(today));
    } else if (whenLower === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      urlParams.set('startDate', formatDate(tomorrow));
    } else if (whenLower === 'this weekend' || whenLower.includes('weekend')) {
      // Find next Saturday
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
      const saturday = new Date(today);
      saturday.setDate(today.getDate() + daysUntilSaturday);
      urlParams.set('startDate', formatDate(saturday));
      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      urlParams.set('endDate', formatDate(sunday));
    } else if (whenLower === 'next week') {
      // Start of next week (Monday)
      const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + daysUntilMonday);
      urlParams.set('startDate', formatDate(nextMonday));
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextMonday.getDate() + 6);
      urlParams.set('endDate', formatDate(nextSunday));
    } else if (whenLower === 'next month') {
      // First day of next month
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      urlParams.set('startDate', formatDate(nextMonth));
      const lastDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      urlParams.set('endDate', formatDate(lastDayNextMonth));
    }

    // Parse "who" into adults/children - handle natural language
    const whoLower = who.toLowerCase();

    // First try numeric patterns like "2 adults, 1 child"
    const adultsMatch = who.match(/(\d+)\s*adult/i);
    const childrenMatch = who.match(/(\d+)\s*child/i);

    if (adultsMatch?.[1]) {
      urlParams.set('adults', adultsMatch[1]);
    } else if (whoLower.includes('solo') || whoLower === 'solo traveller') {
      urlParams.set('adults', '1');
    } else if (whoLower === 'couple') {
      urlParams.set('adults', '2');
    } else if (whoLower.includes('family') || whoLower === 'family with kids') {
      urlParams.set('adults', '2');
      urlParams.set('children', '2');
    } else if (whoLower.includes('friends') || whoLower === 'group of friends') {
      urlParams.set('adults', '4');
    } else if (whoLower.includes('business') || whoLower === 'business trip') {
      urlParams.set('adults', '1');
    }

    if (childrenMatch?.[1]) {
      urlParams.set('children', childrenMatch[1]);
    }

    router.push(`/experiences?${urlParams.toString()}`);
  }, [where, when, who, what, router]);

  // Select a suggestion
  const selectSuggestion = (section: ActiveSection, value: string) => {
    switch (section) {
      case 'where':
        setWhere(value);
        setActiveSection('when');
        break;
      case 'when':
        setWhen(value);
        setActiveSection('who');
        break;
      case 'who':
        setWho(value);
        setActiveSection('what');
        break;
      case 'what':
        setWhat(value);
        setActiveSection(null);
        // Navigate to results when "what" is selected
        setTimeout(() => navigateToResults(), 100);
        break;
    }
  };

  // Render dropdown content for each section
  const renderDropdown = () => {
    if (!activeSection) return null;

    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl">
        {activeSection === 'where' && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>Where</span>
              <span className="font-normal text-gray-500">are you going?</span>
            </div>
            <input
              type="text"
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="e.g. London, Paris, or Rome"
              className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              autoFocus
              onKeyDown={(e) => handleKeyDown(e, 'where')}
            />
            <div className="flex flex-wrap gap-2">
              {isLoadingSuggestions && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div
                    className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                    style={{
                      borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}`,
                    }}
                  />
                  Loading suggestions...
                </div>
              )}
              {getLocationSuggestions().map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => selectSuggestion('where', loc.name)}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor:
                      where.toLowerCase() === loc.name.toLowerCase() ? primaryColor : '#f3f4f6',
                    color: where.toLowerCase() === loc.name.toLowerCase() ? 'white' : '#374151',
                  }}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          </>
        )}

        {activeSection === 'when' && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>When</span>
              <span className="font-normal text-gray-500">are you free?</span>
            </div>
            <input
              type="text"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              placeholder="e.g. This weekend, Next month, or March 15"
              className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              autoFocus
              onKeyDown={(e) => handleKeyDown(e, 'when')}
            />
            <div className="flex flex-wrap gap-2">
              {WHEN_SUGGESTIONS.map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => selectSuggestion('when', sug.label)}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor:
                      when.toLowerCase() === sug.label.toLowerCase() ? primaryColor : '#f3f4f6',
                    color: when.toLowerCase() === sug.label.toLowerCase() ? 'white' : '#374151',
                  }}
                >
                  {sug.label}
                </button>
              ))}
            </div>
          </>
        )}

        {activeSection === 'who' && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <span>Who</span>
              <span className="font-normal text-gray-500">is coming along?</span>
            </div>
            <input
              type="text"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="e.g. 2 adults, Family with kids, or Solo"
              className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              autoFocus
              onKeyDown={(e) => handleKeyDown(e, 'who')}
            />
            <div className="flex flex-wrap gap-2">
              {WHO_SUGGESTIONS.map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => selectSuggestion('who', sug.label)}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor:
                      who.toLowerCase() === sug.label.toLowerCase() ? primaryColor : '#f3f4f6',
                    color: who.toLowerCase() === sug.label.toLowerCase() ? 'white' : '#374151',
                  }}
                >
                  {sug.label}
                </button>
              ))}
            </div>
          </>
        )}

        {activeSection === 'what' && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span>What</span>
              <span className="font-normal text-gray-500">is on your bucket list?</span>
            </div>
            <input
              type="text"
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="e.g. Walking tours, Museums, or Skip-the-line"
              className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              autoFocus
              onKeyDown={(e) => handleKeyDown(e, 'what')}
              onKeyUp={(e) => {
                if (e.key === 'Enter') {
                  navigateToResults();
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {isLoadingSuggestions && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div
                    className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                    style={{
                      borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}`,
                    }}
                  />
                  Loading suggestions...
                </div>
              )}
              {getWhatSuggestions().map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => selectSuggestion('what', sug.label)}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor:
                      what.toLowerCase() === sug.label.toLowerCase() ? primaryColor : '#f3f4f6',
                    color: what.toLowerCase() === sug.label.toLowerCase() ? 'white' : '#374151',
                  }}
                >
                  {sug.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // Sidebar variant
  if (variant === 'sidebar') {
    return (
      <div ref={searchBarRef} className={`relative space-y-3 ${className}`}>
        {/* Compact 4-section search */}
        <div className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          {/* Where */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'where' ? null : 'where')}
            className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
              activeSection === 'where' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-medium text-gray-500">Where</span>
            <span className="block truncate text-sm font-medium text-gray-900">
              {where || 'Anywhere'}
            </span>
          </button>

          <div className="mx-4 border-t border-gray-100" />

          {/* When */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'when' ? null : 'when')}
            className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
              activeSection === 'when' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-medium text-gray-500">When</span>
            <span className="block truncate text-sm font-medium text-gray-900">
              {when || 'Anytime'}
            </span>
          </button>

          <div className="mx-4 border-t border-gray-100" />

          {/* Who */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'who' ? null : 'who')}
            className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
              activeSection === 'who' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-medium text-gray-500">Who</span>
            <span className="block truncate text-sm font-medium text-gray-900">
              {who || 'Anyone'}
            </span>
          </button>

          <div className="mx-4 border-t border-gray-100" />

          {/* What */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'what' ? null : 'what')}
            className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
              activeSection === 'what' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-medium text-gray-500">What</span>
            <span className="block truncate text-sm font-medium text-gray-900">
              {what || 'Anything'}
            </span>
          </button>
        </div>

        {/* Search button */}
        <button
          type="button"
          onClick={navigateToResults}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Search Experiences
        </button>

        {/* Dropdown */}
        {renderDropdown()}

        {/* Context-aware attraction chips */}
        {where && (
          <div className="flex flex-wrap gap-2">
            {getWhatSuggestions()
              .slice(0, 4)
              .map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => {
                    setWhat(sug.label);
                    navigateToResults();
                  }}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  {sug.label}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  }

  // Hero variant (default) - Horizontal 4-section search bar
  return (
    <div ref={searchBarRef} className={`relative w-full ${className}`}>
      {/* Main Search Bar */}
      <div className="rounded-full bg-white p-2 shadow-2xl shadow-black/10">
        <div className="flex items-center">
          {/* Where */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'where' ? null : 'where')}
            className={`flex-1 rounded-full px-6 py-3 text-left transition-colors ${
              activeSection === 'where' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-semibold text-gray-800">Where</span>
            <span className="block truncate text-sm text-gray-500">{where || 'Search destinations...'}</span>
          </button>

          <div className="h-8 w-px bg-gray-200" />

          {/* When */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'when' ? null : 'when')}
            className={`flex-1 rounded-full px-6 py-3 text-left transition-colors ${
              activeSection === 'when' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-semibold text-gray-800">When</span>
            <span className="block truncate text-sm text-gray-500">{when || 'Pick a date'}</span>
          </button>

          <div className="h-8 w-px bg-gray-200" />

          {/* Who */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'who' ? null : 'who')}
            className={`flex-1 rounded-full px-6 py-3 text-left transition-colors ${
              activeSection === 'who' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-semibold text-gray-800">Who</span>
            <span className="block truncate text-sm text-gray-500">{who || 'Add guests'}</span>
          </button>

          <div className="h-8 w-px bg-gray-200" />

          {/* What */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'what' ? null : 'what')}
            className={`flex-1 rounded-full px-6 py-3 text-left transition-colors ${
              activeSection === 'what' ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
          >
            <span className="block text-xs font-semibold text-gray-800">What</span>
            <span className="block truncate text-sm text-gray-500">{what || 'Tours, activities...'}</span>
          </button>

          {/* Search Button */}
          <button
            type="button"
            onClick={navigateToResults}
            className="ml-2 flex h-12 w-12 items-center justify-center rounded-full text-white transition-all hover:scale-105"
            style={{ backgroundColor: primaryColor }}
            aria-label="Search"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {renderDropdown()}

      {/* Context-aware attraction chips */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {where ? (
          // Show context-aware chips when destination is selected
          <>
            <span className="text-sm text-white/80">Explore:</span>
            {getWhatSuggestions()
              .slice(0, 6)
              .map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => {
                    setWhat(sug.label);
                    navigateToResults();
                  }}
                  className="rounded-full bg-white/20 px-3 py-1 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                >
                  {sug.label}
                </button>
              ))}
          </>
        ) : (
          // Show generic popular chips when no destination
          <>
            <span className="text-sm text-white/80">Popular:</span>
            {DEFAULT_WHAT_SUGGESTIONS.map((sug) => (
              <button
                key={sug.id}
                type="button"
                onClick={() => setWhat(sug.label)}
                className="rounded-full bg-white/20 px-3 py-1 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              >
                {sug.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Loading indicator */}
      {isSearching && (
        <div className="absolute right-20 top-1/2 -translate-y-1/2">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
          />
        </div>
      )}
    </div>
  );
}
