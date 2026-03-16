import { describe, it, expect } from 'vitest';
import { PAID_TRAFFIC_CONFIG } from './paid-traffic';

describe('PAID_TRAFFIC_CONFIG', () => {
  describe('budget constraints', () => {
    it('has sensible budget limits', () => {
      expect(PAID_TRAFFIC_CONFIG.maxDailyBudget).toBeGreaterThan(0);
      expect(PAID_TRAFFIC_CONFIG.maxPerCampaignBudget).toBeGreaterThan(0);
      expect(PAID_TRAFFIC_CONFIG.minDailyBudget).toBeGreaterThan(0);
    });

    it('per-campaign budget is less than daily budget', () => {
      expect(PAID_TRAFFIC_CONFIG.maxPerCampaignBudget).toBeLessThan(
        PAID_TRAFFIC_CONFIG.maxDailyBudget
      );
    });

    it('min budget is less than max per-campaign budget', () => {
      expect(PAID_TRAFFIC_CONFIG.minDailyBudget).toBeLessThan(
        PAID_TRAFFIC_CONFIG.maxPerCampaignBudget
      );
    });
  });

  describe('ROAS thresholds', () => {
    it('pause threshold is less than target', () => {
      expect(PAID_TRAFFIC_CONFIG.roasPauseThreshold).toBeLessThan(PAID_TRAFFIC_CONFIG.targetRoas);
    });

    it('scale threshold is greater than target', () => {
      expect(PAID_TRAFFIC_CONFIG.roasScaleThreshold).toBeGreaterThan(
        PAID_TRAFFIC_CONFIG.targetRoas
      );
    });

    it('pause threshold is positive', () => {
      expect(PAID_TRAFFIC_CONFIG.roasPauseThreshold).toBeGreaterThan(0);
    });
  });

  describe('profitability defaults', () => {
    it('has reasonable AOV', () => {
      expect(PAID_TRAFFIC_CONFIG.defaults.aov).toBeGreaterThan(0);
    });

    it('commission rate is between 0 and 100', () => {
      expect(PAID_TRAFFIC_CONFIG.defaults.commissionRate).toBeGreaterThan(0);
      expect(PAID_TRAFFIC_CONFIG.defaults.commissionRate).toBeLessThanOrEqual(100);
    });

    it('CVR is between 0 and 1', () => {
      expect(PAID_TRAFFIC_CONFIG.defaults.cvr).toBeGreaterThan(0);
      expect(PAID_TRAFFIC_CONFIG.defaults.cvr).toBeLessThan(1);
    });
  });

  describe('enabled platforms', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(PAID_TRAFFIC_CONFIG.enabledPlatforms)).toBe(true);
      expect(PAID_TRAFFIC_CONFIG.enabledPlatforms.length).toBeGreaterThan(0);
    });

    it('contains only valid platform values', () => {
      const validPlatforms = ['FACEBOOK', 'GOOGLE_SEARCH'];
      for (const platform of PAID_TRAFFIC_CONFIG.enabledPlatforms) {
        expect(validPlatforms).toContain(platform);
      }
    });
  });

  describe('keyword scanning thresholds', () => {
    it('max CPC is positive', () => {
      expect(PAID_TRAFFIC_CONFIG.maxCpc).toBeGreaterThan(0);
    });

    it('min volume is positive', () => {
      expect(PAID_TRAFFIC_CONFIG.minVolume).toBeGreaterThan(0);
    });
  });

  describe('meta consolidated config', () => {
    it('has CBO enabled', () => {
      expect(PAID_TRAFFIC_CONFIG.metaConsolidated.cboEnabled).toBe(true);
    });

    it('has valid bid strategy', () => {
      expect(PAID_TRAFFIC_CONFIG.metaConsolidated.bidStrategy).toBe('LOWEST_COST_WITHOUT_CAP');
    });

    it('has category patterns defined', () => {
      const patterns = PAID_TRAFFIC_CONFIG.metaConsolidated.categoryPatterns;
      expect(Object.keys(patterns).length).toBeGreaterThan(5);
    });

    it('each category pattern has at least one keyword', () => {
      const patterns = PAID_TRAFFIC_CONFIG.metaConsolidated.categoryPatterns;
      for (const [category, keywords] of Object.entries(patterns)) {
        expect((keywords as string[]).length, `${category} has no keywords`).toBeGreaterThan(0);
      }
    });

    it('fast-fail spend is positive', () => {
      expect(PAID_TRAFFIC_CONFIG.metaConsolidated.fastFailSpend).toBeGreaterThan(0);
    });
  });

  describe('search term harvesting', () => {
    it('has positive thresholds', () => {
      expect(PAID_TRAFFIC_CONFIG.searchTermExcludeSpendThreshold).toBeGreaterThan(0);
      expect(PAID_TRAFFIC_CONFIG.searchTermExcludeClickThreshold).toBeGreaterThan(0);
    });
  });

  describe('excluded domains', () => {
    it('is an array', () => {
      expect(Array.isArray(PAID_TRAFFIC_CONFIG.excludedDomains)).toBe(true);
    });
  });
});
