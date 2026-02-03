import { NextResponse } from 'next/server';
import { executeNextTasks } from '@experience-marketplace/jobs';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, name: true, autonomousProcessesPaused: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if autonomous processes are paused for this site
    if (site.autonomousProcessesPaused) {
      return NextResponse.json(
        {
          error: 'Autonomous processes are paused for this site',
          success: false,
        },
        { status: 400 }
      );
    }

    // Execute next tasks
    const result = await executeNextTasks(id);

    return NextResponse.json({
      success: true,
      siteName: site.name,
      ...result,
    });
  } catch (error) {
    console.error('[API] Error executing tasks:', error);
    return NextResponse.json({ error: 'Failed to execute tasks' }, { status: 500 });
  }
}
