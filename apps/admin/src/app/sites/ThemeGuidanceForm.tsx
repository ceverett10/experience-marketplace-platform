'use client';

import React, { useState } from 'react';

export interface ThemeGuidanceData {
  description?: string;
  personality?: string[];
  targetAudience?: string;
  colorDirection?: string;
  moodKeywords?: string[];
}

const PERSONALITY_OPTIONS = [
  'Adventurous',
  'Premium',
  'Friendly',
  'Expert',
  'Warm',
  'Playful',
  'Sophisticated',
  'Bold',
  'Minimalist',
  'Rustic',
  'Luxurious',
  'Energetic',
  'Calm',
  'Professional',
  'Edgy',
  'Welcoming',
];

const MOOD_OPTIONS = [
  'Bohemian',
  'Rustic',
  'Modern',
  'Classic',
  'Tropical',
  'Urban',
  'Nature',
  'Elegant',
  'Cosy',
  'Vibrant',
  'Serene',
  'Industrial',
  'Coastal',
  'Alpine',
  'Mediterranean',
  'Scandinavian',
];

interface ThemeGuidanceFormProps {
  initialData?: ThemeGuidanceData;
  onSubmit: (data: ThemeGuidanceData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export default function ThemeGuidanceForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Generate',
}: ThemeGuidanceFormProps) {
  const [description, setDescription] = useState(initialData?.description || '');
  const [selectedPersonality, setSelectedPersonality] = useState<string[]>(
    initialData?.personality || []
  );
  const [targetAudience, setTargetAudience] = useState(initialData?.targetAudience || '');
  const [colorDirection, setColorDirection] = useState(initialData?.colorDirection || '');
  const [selectedMoods, setSelectedMoods] = useState<string[]>(initialData?.moodKeywords || []);

  const toggleTag = (
    tag: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setSelected(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  };

  const handleSubmit = () => {
    const data: ThemeGuidanceData = {};
    if (description.trim()) data.description = description.trim();
    if (selectedPersonality.length > 0) data.personality = selectedPersonality;
    if (targetAudience.trim()) data.targetAudience = targetAudience.trim();
    if (colorDirection.trim()) data.colorDirection = colorDirection.trim();
    if (selectedMoods.length > 0) data.moodKeywords = selectedMoods;
    onSubmit(data);
  };

  const hasAnyInput =
    description.trim() ||
    selectedPersonality.length > 0 ||
    targetAudience.trim() ||
    colorDirection.trim() ||
    selectedMoods.length > 0;

  return (
    <div className="space-y-4">
      {/* Theme description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Theme Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the look and feel you want, e.g. 'Luxury, minimalist, earth tones — targeting affluent couples looking for romantic getaways'"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          rows={3}
          disabled={isLoading}
        />
      </div>

      {/* Personality traits */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Brand Personality</label>
        <div className="flex flex-wrap gap-1.5">
          {PERSONALITY_OPTIONS.map((trait) => (
            <button
              key={trait}
              type="button"
              onClick={() => toggleTag(trait, selectedPersonality, setSelectedPersonality)}
              disabled={isLoading}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selectedPersonality.includes(trait)
                  ? 'bg-sky-100 border-sky-300 text-sky-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              } disabled:opacity-50`}
            >
              {trait}
            </button>
          ))}
        </div>
      </div>

      {/* Target audience */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Target Audience</label>
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="e.g. 'Young professional couples aged 28-40'"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          disabled={isLoading}
        />
      </div>

      {/* Color direction */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Color Direction</label>
        <input
          type="text"
          value={colorDirection}
          onChange={(e) => setColorDirection(e.target.value)}
          placeholder="e.g. 'Earthy greens and terracotta, avoid blues'"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          disabled={isLoading}
        />
      </div>

      {/* Mood keywords */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mood / Style</label>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_OPTIONS.map((mood) => (
            <button
              key={mood}
              type="button"
              onClick={() => toggleTag(mood, selectedMoods, setSelectedMoods)}
              disabled={isLoading}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selectedMoods.includes(mood)
                  ? 'bg-purple-100 border-purple-300 text-purple-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              } disabled:opacity-50`}
            >
              {mood}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          {hasAnyInput
            ? 'AI will use your direction'
            : 'All fields are optional — AI will use defaults'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg font-medium transition-colors"
          >
            {isLoading ? 'Generating...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
