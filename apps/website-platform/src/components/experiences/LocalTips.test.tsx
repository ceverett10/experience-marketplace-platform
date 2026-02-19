import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocalTips } from './LocalTips';

describe('LocalTips', () => {
  it('renders "Insider tips for {locationName}" heading', () => {
    render(<LocalTips locationName="London" categories={[]} />);
    expect(screen.getByText('Insider tips for London')).toBeInTheDocument();
  });

  it('renders 3 tips', () => {
    render(<LocalTips locationName="London" categories={[]} />);
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
  });

  it('shows food tips for food-related categories', () => {
    render(<LocalTips locationName="Rome" categories={['Food Tours']} />);
    const tipTexts = screen.getAllByRole('listitem').map((li) => li.textContent);
    const foodTips = [
      'Come with an empty stomach',
      'dietary requirements',
      'restaurant recommendations',
    ];
    const hasFoodTip = tipTexts.some((text) => foodTips.some((tip) => text?.includes(tip)));
    expect(hasFoodTip).toBe(true);
  });

  it('shows outdoor tips for hiking categories', () => {
    render(<LocalTips locationName="Denver" categories={['Hiking']} />);
    const tipTexts = screen.getAllByRole('listitem').map((li) => li.textContent);
    const outdoorTips = ['weather forecast', 'sunscreen', 'small backpack'];
    const hasOutdoorTip = tipTexts.some((text) => outdoorTips.some((tip) => text?.includes(tip)));
    expect(hasOutdoorTip).toBe(true);
  });

  it('shows cultural tips for museum categories', () => {
    render(<LocalTips locationName="Florence" categories={['Museum Tours']} />);
    const tipTexts = screen.getAllByRole('listitem').map((li) => li.textContent);
    const culturalTips = ['dress code', 'Photos may be restricted', 'local history'];
    const hasCulturalTip = tipTexts.some((text) => culturalTips.some((tip) => text?.includes(tip)));
    expect(hasCulturalTip).toBe(true);
  });

  it('shows water tips for boat categories', () => {
    render(<LocalTips locationName="Miami" categories={['Boat Tours']} />);
    const tipTexts = screen.getAllByRole('listitem').map((li) => li.textContent);
    const waterTips = ['getting wet', 'waterproof bag', 'seasickness'];
    const hasWaterTip = tipTexts.some((text) => waterTips.some((tip) => text?.includes(tip)));
    expect(hasWaterTip).toBe(true);
  });

  it('shows general tips when no matching category', () => {
    render(<LocalTips locationName="Tokyo" categories={['Random']} />);
    const tipTexts = screen.getAllByRole('listitem').map((li) => li.textContent);
    const generalTips = [
      'Arrive 10-15 minutes early',
      'comfortable walking shoes',
      'reusable water bottle',
      'offline map',
      'local currency',
    ];
    const allFromGeneral = tipTexts.every((text) => generalTips.some((tip) => text?.includes(tip)));
    expect(allFromGeneral).toBe(true);
  });

  it('returns consistent tips for same locationName (deterministic)', () => {
    const { unmount } = render(<LocalTips locationName="London" categories={['Tours']} />);
    const firstRenderTips = screen.getAllByRole('listitem').map((li) => li.textContent);
    unmount();

    render(<LocalTips locationName="London" categories={['Tours']} />);
    const secondRenderTips = screen.getAllByRole('listitem').map((li) => li.textContent);

    expect(firstRenderTips).toEqual(secondRenderTips);
  });

  it('shows generic "Insider tips" when locationName is empty string', () => {
    render(<LocalTips locationName="" categories={[]} />);
    expect(screen.getByText('Insider tips')).toBeInTheDocument();
  });
});
