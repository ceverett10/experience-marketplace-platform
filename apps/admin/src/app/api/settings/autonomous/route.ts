import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

export async function GET() {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: 'platform_settings_singleton' },
    });

    if (!settings) {
      return NextResponse.json(
        { success: false, error: 'Platform settings not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: {
        allProcessesPaused: settings.allAutonomousProcessesPaused,
        pausedAt: settings.pausedAt,
        pausedBy: settings.pausedBy,
        pauseReason: settings.pauseReason,
        enableSiteCreation: settings.enableSiteCreation,
        enableContentGeneration: settings.enableContentGeneration,
        enableGSCVerification: settings.enableGSCVerification,
        enableContentOptimization: settings.enableContentOptimization,
        enableABTesting: settings.enableABTesting,
        maxTotalSites: settings.maxTotalSites,
        maxSitesPerHour: settings.maxSitesPerHour,
        maxContentPagesPerHour: settings.maxContentPagesPerHour,
        maxGSCRequestsPerHour: settings.maxGSCRequestsPerHour,
        maxOpportunityScansPerDay: settings.maxOpportunityScansPerDay,
      },
    });
  } catch (error) {
    console.error('Failed to fetch autonomous settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const updates = await request.json();

    // Build the update object with only valid fields
    const validUpdates: Record<string, unknown> = {};
    const allowedFields = [
      'enableSiteCreation',
      'enableContentGeneration',
      'enableGSCVerification',
      'enableContentOptimization',
      'enableABTesting',
      'maxTotalSites',
      'maxSitesPerHour',
      'maxContentPagesPerHour',
      'maxGSCRequestsPerHour',
      'maxOpportunityScansPerDay',
    ];

    for (const field of allowedFields) {
      if (field in updates) {
        validUpdates[field] = updates[field];
      }
    }

    // Update platform settings
    const updatedSettings = await prisma.platformSettings.update({
      where: { id: 'platform_settings_singleton' },
      data: validUpdates,
    });

    return NextResponse.json({
      success: true,
      message: 'Autonomous settings updated successfully',
      settings: updatedSettings,
    });
  } catch (error) {
    console.error('Failed to update autonomous settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
