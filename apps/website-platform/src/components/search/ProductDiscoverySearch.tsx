'use client';

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBrand } from '@/lib/site-context';
import { trackSearch } from '@/lib/analytics';

interface ProductDiscoverySearchProps {
  variant?: 'hero' | 'inline' | 'sidebar';
  defaultDestination?: string;
  defaultWhat?: string; // Pre-fill the "What" field (e.g., "Food & Drink")
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

// Reusable field icon components
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

function MapPinIcon({ className = 'h-4 w-4', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  );
}

function CalendarIcon({ className = 'h-4 w-4', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function PeopleIcon({ className = 'h-4 w-4', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function SearchIcon({ className = 'h-4 w-4', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

export function ProductDiscoverySearch({
  variant = 'hero',
  defaultDestination = '',
  defaultWhat = '',
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
  const [what, setWhat] = useState(searchParams.get('q') || defaultWhat || '');

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
    } else if (e.key === 'Enter') {
      // Trigger search when Enter is pressed in any input
      e.preventDefault();
      setActiveSection(null);
      navigateToResults();
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

    // Preserve raw when/who values for display on search results page
    if (when) urlParams.set('when', when);
    if (who) urlParams.set('who', who);

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

    trackSearch(what || where || 'browse', where || undefined);
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

  // Section icon/label/placeholder config
  const sectionConfig = {
    where: {
      icon: MapPinIcon,
      label: 'Where',
      subtitle: 'are you going?',
      placeholder: 'e.g. London, Paris, or Rome',
    },
    when: {
      icon: CalendarIcon,
      label: 'When',
      subtitle: 'are you free?',
      placeholder: 'e.g. This weekend, Next month, or March 15',
    },
    who: {
      icon: PeopleIcon,
      label: 'Who',
      subtitle: 'is coming along?',
      placeholder: 'e.g. 2 adults, Family with kids, or Solo',
    },
    what: {
      icon: SearchIcon,
      label: 'What',
      subtitle: 'is on your bucket list?',
      placeholder: 'e.g. Walking tours, Museums, or Skip-the-line',
    },
  } as const;

  // Get value/setter for a section
  const sectionValues: Record<
    'where' | 'when' | 'who' | 'what',
    { value: string; setter: (v: string) => void }
  > = {
    where: { value: where, setter: setWhere },
    when: { value: when, setter: setWhen },
    who: { value: who, setter: setWho },
    what: { value: what, setter: setWhat },
  };

  // Get suggestions for a section
  const getSuggestionsForSection = (section: ActiveSection) => {
    if (section === 'where') {
      return getLocationSuggestions().map((loc) => ({ id: loc.id, label: loc.name }));
    }
    if (section === 'when') return WHEN_SUGGESTIONS;
    if (section === 'who') return WHO_SUGGESTIONS;
    if (section === 'what') return getWhatSuggestions();
    return [];
  };

  // Render dropdown content for a section (shared between mobile bottom sheet and desktop inline)
  const renderDropdownContent = (section: NonNullable<ActiveSection>) => {
    const config = sectionConfig[section];
    const { value, setter } = sectionValues[section];
    const suggestions = getSuggestionsForSection(section);
    const showLoading = isLoadingSuggestions && (section === 'where' || section === 'what');
    const Icon = config.icon;

    return (
      <>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
          <Icon className="h-4 w-4 text-gray-500" />
          <span>{config.label}</span>
          <span className="font-normal text-gray-500">{config.subtitle}</span>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setter(e.target.value)}
          placeholder={config.placeholder}
          className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-base sm:text-sm focus:border-transparent focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
          autoFocus
          onKeyDown={(e) => handleKeyDown(e, section)}
        />
        <div className="flex flex-wrap gap-2">
          {showLoading && (
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
          {suggestions.map((sug) => (
            <button
              key={sug.id}
              type="button"
              onClick={() => selectSuggestion(section, sug.label)}
              className="rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-105"
              style={{
                backgroundColor:
                  value.toLowerCase() === sug.label.toLowerCase() ? primaryColor : '#f3f4f6',
                color: value.toLowerCase() === sug.label.toLowerCase() ? 'white' : '#374151',
              }}
            >
              {sug.label}
            </button>
          ))}
        </div>
      </>
    );
  };

  // Desktop inline dropdown
  const renderDesktopDropdown = () => {
    if (!activeSection) return null;

    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-2 hidden max-h-[60vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl md:block">
        {renderDropdownContent(activeSection)}
      </div>
    );
  };

  // Mobile full-screen search overlay — keeps input visible above keyboard
  const renderMobileBottomSheet = () => {
    if (!activeSection) return null;

    const config = sectionConfig[activeSection];
    const { value, setter } = sectionValues[activeSection];
    const suggestions = getSuggestionsForSection(activeSection);
    const showLoading =
      isLoadingSuggestions && (activeSection === 'where' || activeSection === 'what');
    const Icon = config.icon;

    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-white md:hidden">
        {/* Fixed header with close + input */}
        <div className="flex-shrink-0 border-b border-gray-100 px-4 pb-4 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <Icon className="h-4 w-4 text-gray-500" />
              <span>{config.label}</span>
              <span className="font-normal text-gray-500">{config.subtitle}</span>
            </div>
            <button
              onClick={() => setActiveSection(null)}
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setter(e.target.value)}
            placeholder={config.placeholder}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            autoFocus
            onKeyDown={(e) => handleKeyDown(e, activeSection)}
          />
        </div>

        {/* Scrollable suggestions */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {showLoading && (
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
            {suggestions.map((sug) => (
              <button
                key={sug.id}
                type="button"
                onClick={() => selectSuggestion(activeSection, sug.label)}
                className="rounded-full px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  backgroundColor:
                    value.toLowerCase() === sug.label.toLowerCase() ? primaryColor : '#f3f4f6',
                  color: value.toLowerCase() === sug.label.toLowerCase() ? 'white' : '#374151',
                }}
              >
                {sug.label}
              </button>
            ))}
          </div>
        </div>
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
        {activeSection && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl">
            {renderDropdownContent(activeSection)}
          </div>
        )}

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

  // Mobile field placeholder text
  const mobileFieldPlaceholders = {
    where: 'Search destinations...',
    when: 'Pick a date',
    who: 'Add guests',
    what: 'Tours, activities...',
  };

  // Render a mobile field button with icon
  const renderMobileField = (section: 'where' | 'when' | 'who' | 'what') => {
    const config = sectionConfig[section];
    const { value } = sectionValues[section];
    const Icon = config.icon;
    const isActive = activeSection === section;
    const isFilled = !!value;

    return (
      <button
        type="button"
        onClick={() => setActiveSection(isActive ? null : section)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
          isActive ? 'bg-gray-50' : 'hover:bg-gray-50/50'
        }`}
        style={
          isActive
            ? { borderLeft: `3px solid ${primaryColor}`, paddingLeft: '9px' }
            : { borderLeft: '3px solid transparent', paddingLeft: '9px' }
        }
      >
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: primaryColor }} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gray-800">{config.label}</span>
          <span
            className={`block truncate text-sm ${
              isFilled ? 'font-medium text-gray-900' : 'text-gray-400'
            }`}
          >
            {value || mobileFieldPlaceholders[section]}
          </span>
        </div>
        {isFilled && (
          <div
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: primaryColor }}
          >
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
      </button>
    );
  };

  // Hero variant (default) - Horizontal 4-section search bar (stacks on mobile)
  return (
    <div ref={searchBarRef} className={`relative w-full ${className}`}>
      {/* Main Search Bar - Desktop: horizontal pill, Mobile: vertical card */}
      <div className="rounded-2xl bg-white p-2 shadow-2xl shadow-black/10 md:rounded-full">
        {/* Mobile Layout - Stacked with icons */}
        <div className="flex flex-col md:hidden">
          {renderMobileField('where')}
          <div className="mx-3 border-t border-gray-100" />
          {renderMobileField('when')}
          <div className="mx-3 border-t border-gray-100" />
          {renderMobileField('who')}
          <div className="mx-3 border-t border-gray-100" />
          {renderMobileField('what')}

          {/* Mobile Search Button - Gradient with shadow */}
          <button
            type="button"
            onClick={navigateToResults}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
              boxShadow: `0 4px 14px ${primaryColor}40`,
            }}
          >
            <SearchIcon className="h-5 w-5" />
            Search Experiences
          </button>
        </div>

        {/* Desktop Layout - Horizontal with icons */}
        <div className="hidden items-center md:flex">
          {/* Where */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'where' ? null : 'where')}
            className={`flex flex-1 items-center gap-2 rounded-full px-5 py-3 text-left transition-all ${
              activeSection === 'where' ? 'bg-gray-100 shadow-sm' : 'hover:bg-gray-50'
            }`}
          >
            <MapPinIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800">Where</span>
              <span
                className={`block truncate text-sm ${where ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {where || 'Search destinations...'}
              </span>
            </div>
          </button>

          <div className="h-8 w-px bg-gray-200" />

          {/* When */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'when' ? null : 'when')}
            className={`flex flex-1 items-center gap-2 rounded-full px-5 py-3 text-left transition-all ${
              activeSection === 'when' ? 'bg-gray-100 shadow-sm' : 'hover:bg-gray-50'
            }`}
          >
            <CalendarIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800">When</span>
              <span
                className={`block truncate text-sm ${when ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {when || 'Pick a date'}
              </span>
            </div>
          </button>

          <div className="h-8 w-px bg-gray-200" />

          {/* Who */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'who' ? null : 'who')}
            className={`flex flex-1 items-center gap-2 rounded-full px-5 py-3 text-left transition-all ${
              activeSection === 'who' ? 'bg-gray-100 shadow-sm' : 'hover:bg-gray-50'
            }`}
          >
            <PeopleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800">Who</span>
              <span
                className={`block truncate text-sm ${who ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {who || 'Add guests'}
              </span>
            </div>
          </button>

          <div className="h-8 w-px bg-gray-200" />

          {/* What */}
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'what' ? null : 'what')}
            className={`flex flex-1 items-center gap-2 rounded-full px-5 py-3 text-left transition-all ${
              activeSection === 'what' ? 'bg-gray-100 shadow-sm' : 'hover:bg-gray-50'
            }`}
          >
            <SearchIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800">What</span>
              <span
                className={`block truncate text-sm ${what ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {what || 'Tours, activities...'}
              </span>
            </div>
          </button>

          {/* Search Button */}
          <button
            type="button"
            onClick={navigateToResults}
            className="ml-2 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md transition-all hover:scale-105 hover:shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
            }}
            aria-label="Search"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Desktop Dropdown (inline) */}
      {renderDesktopDropdown()}

      {/* Mobile Bottom Sheet */}
      {renderMobileBottomSheet()}

      {/* Context-aware attraction chips - Visible on all sizes, scrollable on mobile */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:justify-center sm:overflow-visible">
        {where ? (
          <>
            <span className="flex-shrink-0 text-sm text-white/80">Explore:</span>
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
                  className="flex-shrink-0 rounded-full bg-white/20 px-3 py-1 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                >
                  {sug.label}
                </button>
              ))}
          </>
        ) : (
          <>
            <span className="flex-shrink-0 text-sm text-white/80">Popular:</span>
            {DEFAULT_WHAT_SUGGESTIONS.map((sug) => (
              <button
                key={sug.id}
                type="button"
                onClick={() => setWhat(sug.label)}
                className="flex-shrink-0 rounded-full bg-white/20 px-3 py-1 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              >
                {sug.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Loading indicator - Desktop only */}
      {isSearching && (
        <div className="absolute right-20 top-1/2 hidden -translate-y-1/2 md:block">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
          />
        </div>
      )}
    </div>
  );
}
