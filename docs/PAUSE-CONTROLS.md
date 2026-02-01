# Autonomous Process Pause Controls

**Purpose**: Safety mechanism to stop/pause all autonomous operations at any point, either globally or per-site.

---

## Overview

The platform includes multiple levels of pause controls:

1. **Global Platform Pause** - Stops all autonomous processes across all sites
2. **Per-Site Pause** - Stops autonomous processes for a specific site
3. **Feature Flags** - Disable specific types of operations (site creation, content generation, etc.)
4. **Rate Limits** - Control the maximum operations per hour/day

---

## Database Schema

### PlatformSettings Model

Global controls for the entire platform (singleton pattern):

```prisma
model PlatformSettings {
  id String @id @default(cuid())

  // Global Autonomous Controls
  allAutonomousProcessesPaused Boolean   @default(false) // Emergency stop
  pausedAt                     DateTime?
  pausedBy                     String?  // Admin identifier
  pauseReason                  String?

  // Feature Flags
  enableSiteCreation        Boolean @default(true)
  enableContentGeneration   Boolean @default(true)
  enableGSCVerification     Boolean @default(true)
  enableContentOptimization Boolean @default(true)
  enableABTesting           Boolean @default(true)

  // Rate Limits (per hour unless specified)
  maxSitesPerHour           Int @default(10)
  maxContentPagesPerHour    Int @default(100)
  maxGSCRequestsPerHour     Int @default(200)
  maxOpportunityScansPerDay Int @default(50)
}
```

### Site Model Updates

Per-site autonomous controls:

```prisma
model Site {
  // ... existing fields

  // Autonomous Process Controls
  autonomousProcessesPaused Boolean   @default(false)
  pausedAt                  DateTime?
  pausedBy                  String?
  pauseReason               String?

  // ... rest of model
}
```

---

## Usage: Worker Check Before Processing

Every worker must check pause status before executing:

```typescript
import { prisma } from '@experience-marketplace/database';

async function isProcessingAllowed(siteId?: string): Promise<boolean> {
  // 1. Check global platform pause
  const platformSettings = await prisma.platformSettings.findFirst({
    where: { id: 'platform_settings_singleton' },
  });

  if (platformSettings?.allAutonomousProcessesPaused) {
    console.log('[Pause Check] ❌ Global platform pause is active');
    return false;
  }

  // 2. Check specific feature flag (example: site creation)
  if (!platformSettings?.enableSiteCreation) {
    console.log('[Pause Check] ❌ Site creation is disabled');
    return false;
  }

  // 3. Check per-site pause (if siteId provided)
  if (siteId) {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { autonomousProcessesPaused: true },
    });

    if (site?.autonomousProcessesPaused) {
      console.log(`[Pause Check] ❌ Site ${siteId} autonomous processes are paused`);
      return false;
    }
  }

  return true;
}

// Example usage in a worker
export async function siteCreationWorker(job: Job) {
  // Check if processing is allowed before starting
  if (!(await isProcessingAllowed())) {
    console.log('[Site Creation] Skipping - autonomous processes are paused');
    return { skipped: true, reason: 'Autonomous processes paused' };
  }

  // Proceed with site creation...
}
```

---

## Admin API Endpoints

### Global Pause Controls

**Pause All Autonomous Processes**

```typescript
// POST /admin/api/settings/pause-all
export async function POST(request: Request) {
  const { pausedBy, pauseReason } = await request.json();

  await prisma.platformSettings.update({
    where: { id: 'platform_settings_singleton' },
    data: {
      allAutonomousProcessesPaused: true,
      pausedAt: new Date(),
      pausedBy,
      pauseReason,
    },
  });

  return NextResponse.json({ success: true, message: 'All autonomous processes paused' });
}
```

**Resume All Autonomous Processes**

```typescript
// POST /admin/api/settings/resume-all
export async function POST() {
  await prisma.platformSettings.update({
    where: { id: 'platform_settings_singleton' },
    data: {
      allAutonomousProcessesPaused: false,
      pausedAt: null,
      pausedBy: null,
      pauseReason: null,
    },
  });

  return NextResponse.json({ success: true, message: 'Autonomous processes resumed' });
}
```

### Per-Site Pause Controls

**Pause Specific Site**

```typescript
// POST /admin/api/sites/[siteId]/pause
export async function POST(
  request: Request,
  { params }: { params: { siteId: string } }
) {
  const { pausedBy, pauseReason } = await request.json();
  const { siteId } = params;

  await prisma.site.update({
    where: { id: siteId },
    data: {
      autonomousProcessesPaused: true,
      pausedAt: new Date(),
      pausedBy,
      pauseReason,
    },
  });

  return NextResponse.json({ success: true, message: `Site ${siteId} paused` });
}
```

### Feature Flag Controls

**Toggle Feature Flags**

```typescript
// PATCH /admin/api/settings/features
export async function PATCH(request: Request) {
  const featureFlags = await request.json();
  // featureFlags = { enableSiteCreation: false, enableContentGeneration: true, ... }

  await prisma.platformSettings.update({
    where: { id: 'platform_settings_singleton' },
    data: featureFlags,
  });

  return NextResponse.json({ success: true, featureFlags });
}
```

---

## Admin UI Components

### Global Emergency Stop Button

```tsx
'use client';

import { useState } from 'react';

export function EmergencyStopButton() {
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTogglePause = async () => {
    setLoading(true);

    const endpoint = isPaused
      ? '/admin/api/settings/resume-all'
      : '/admin/api/settings/pause-all';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pausedBy: 'admin_user_id',  // Get from session
        pauseReason: 'Manual emergency stop',
      }),
    });

    if (response.ok) {
      setIsPaused(!isPaused);
    }

    setLoading(false);
  };

  return (
    <button
      onClick={handleTogglePause}
      disabled={loading}
      className={`
        px-6 py-3 rounded-lg font-semibold text-white
        ${isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {loading ? 'Processing...' : isPaused ? '▶️ Resume All' : '⏸️ Pause All'}
    </button>
  );
}
```

### Feature Flags Panel

```tsx
'use client';

export function FeatureFlagsPanel({ settings }: { settings: PlatformSettings }) {
  const [flags, setFlags] = useState({
    enableSiteCreation: settings.enableSiteCreation,
    enableContentGeneration: settings.enableContentGeneration,
    enableGSCVerification: settings.enableGSCVerification,
    enableContentOptimization: settings.enableContentOptimization,
    enableABTesting: settings.enableABTesting,
  });

  const handleToggle = async (flagName: string) => {
    const newFlags = { ...flags, [flagName]: !flags[flagName] };
    setFlags(newFlags);

    await fetch('/admin/api/settings/features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFlags),
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Feature Flags</h3>
      {Object.entries(flags).map(([key, value]) => (
        <label key={key} className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={value}
            onChange={() => handleToggle(key)}
            className="w-5 h-5"
          />
          <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
        </label>
      ))}
    </div>
  );
}
```

---

## Rate Limiting

Workers should respect rate limits:

```typescript
async function checkRateLimit(operationType: string): Promise<boolean> {
  const settings = await prisma.platformSettings.findFirst({
    where: { id: 'platform_settings_singleton' },
  });

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Example: Check site creation rate limit
  if (operationType === 'SITE_CREATE') {
    const recentSites = await prisma.site.count({
      where: {
        createdAt: { gte: hourAgo },
      },
    });

    if (recentSites >= settings.maxSitesPerHour) {
      console.log(`[Rate Limit] ❌ Max sites per hour reached (${recentSites}/${settings.maxSitesPerHour})`);
      return false;
    }
  }

  return true;
}
```

---

## Deployment Steps

### 1. Apply Migration

```bash
# In production
cd packages/database
npx prisma migrate deploy
```

### 2. Initialize Platform Settings

```bash
# Run this once after migration
npx prisma db seed  # Or manual INSERT via SQL
```

### 3. Add UI Components

Add the Emergency Stop button and Feature Flags panel to:
- `apps/admin/src/app/settings/page.tsx`

### 4. Update All Workers

Add `isProcessingAllowed()` check to every autonomous worker.

---

## Testing

### Test Global Pause

```bash
# 1. Pause all processes
curl -X POST http://localhost:3001/admin/api/settings/pause-all \
  -H "Content-Type: application/json" \
  -d '{"pausedBy": "test_admin", "pauseReason": "Testing"}'

# 2. Try to trigger a job (should be skipped)
curl -X POST http://localhost:3001/admin/api/sites/create

# 3. Resume
curl -X POST http://localhost:3001/admin/api/settings/resume-all
```

### Test Per-Site Pause

```bash
# Pause specific site
curl -X POST http://localhost:3001/admin/api/sites/{siteId}/pause \
  -H "Content-Type: application/json" \
  -d '{"pausedBy": "test_admin", "pauseReason": "Maintenance"}'
```

---

## Monitoring

Monitor pause status in logs:

```bash
# Check if processes are paused
heroku logs --tail -a your-app | grep "Pause Check"

# Output examples:
# [Pause Check] ❌ Global platform pause is active
# [Pause Check] ❌ Site site_123 autonomous processes are paused
# [Pause Check] ✅ Processing allowed
```

---

## Safety Best Practices

1. **Always check pause status** at the start of every worker function
2. **Log pause events** with reason and admin identifier
3. **Display pause status** prominently in admin dashboard
4. **Send notifications** when global pause is activated
5. **Auto-resume option** with scheduled time (future enhancement)

---

## Future Enhancements

- **Scheduled Pause**: Set pause to auto-resume at specific time
- **Notification System**: Email/Slack alerts when paused
- **Audit Log**: Track all pause/resume events
- **Partial Pause**: Pause only specific operation types
- **Queue Draining**: Finish running jobs before pausing
