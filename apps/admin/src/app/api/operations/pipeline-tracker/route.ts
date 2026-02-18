export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/operations/pipeline-tracker
 * Returns all pipeline tasks, phase summaries, and verification results
 */
export async function GET(): Promise<NextResponse> {
  try {
    const tasks = await prisma.pipelineTask.findMany({
      orderBy: [{ phase: 'asc' }, { taskNumber: 'asc' }],
    });

    // Phase summaries
    const phases: Record<number, { total: number; verified: number; inProgress: number; blocked: number; failed: number }> = {};
    for (const task of tasks) {
      if (!phases[task.phase]) {
        phases[task.phase] = { total: 0, verified: 0, inProgress: 0, blocked: 0, failed: 0 };
      }
      const p = phases[task.phase]!;
      p.total++;
      if (task.status === 'VERIFIED') p.verified++;
      if (task.status === 'IN_PROGRESS' || task.status === 'IMPLEMENTED' || task.status === 'TESTING' || task.status === 'DEPLOYED') {
        p.inProgress++;
      }
      if (task.status === 'BLOCKED') p.blocked++;
      if (task.status === 'FAILED') p.failed++;
    }

    // Overall progress
    const total = tasks.length;
    const verified = tasks.filter((t) => t.status === 'VERIFIED').length;
    const deployed = tasks.filter((t) => t.status === 'DEPLOYED' || t.status === 'VERIFIED').length;

    // Health checks — tasks that have verification queries
    const healthChecks = tasks
      .filter((t) => t.verificationQuery)
      .map((t) => ({
        taskId: t.id,
        taskNumber: t.taskNumber,
        title: t.title,
        phase: t.phase,
        expected: t.verificationTarget,
        actual: t.lastCheckResult,
        passed: t.lastCheckPassed,
        checkedAt: t.lastCheckAt,
      }));

    // Recent events
    const events = await prisma.pipelineTaskEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Enrich events with task info
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const enrichedEvents = events.map((e) => {
      const task = taskMap.get(e.taskId);
      return {
        ...e,
        taskNumber: task?.taskNumber,
        taskTitle: task?.title,
      };
    });

    return NextResponse.json({
      tasks,
      phases,
      healthChecks,
      events: enrichedEvents,
      overall: { total, verified, deployed, percentage: total > 0 ? Math.round((verified / total) * 100) : 0 },
    });
  } catch (error) {
    console.error('[Pipeline Tracker API] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch pipeline data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/operations/pipeline-tracker
 * Handles actions: update_status, run_verification, add_note, set_pr
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'update_status': {
        const { taskId, status, note } = body;
        if (!taskId || !status) {
          return NextResponse.json({ error: 'taskId and status required' }, { status: 400 });
        }

        const existing = await prisma.pipelineTask.findUnique({ where: { id: taskId } });
        if (!existing) {
          return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // Build update data with timestamp tracking
        const now = new Date();
        const updateData: Parameters<typeof prisma.pipelineTask.update>[0]['data'] = { status };
        if (status === 'IMPLEMENTED') updateData['implementedAt'] = now;
        if (status === 'TESTING') updateData['testedAt'] = now;
        if (status === 'DEPLOYED') updateData['deployedAt'] = now;
        if (status === 'VERIFIED') updateData['verifiedAt'] = now;
        if (note) updateData['notes'] = existing.notes ? `${existing.notes}\n\n${now.toISOString()}: ${note}` : `${now.toISOString()}: ${note}`;

        const [task] = await prisma.$transaction([
          prisma.pipelineTask.update({ where: { id: taskId }, data: updateData }),
          prisma.pipelineTaskEvent.create({
            data: {
              taskId,
              fromStatus: existing.status,
              toStatus: status,
              note: note || null,
            },
          }),
        ]);

        return NextResponse.json({ success: true, task });
      }

      case 'add_note': {
        const { taskId, note } = body;
        if (!taskId || !note) {
          return NextResponse.json({ error: 'taskId and note required' }, { status: 400 });
        }

        const existing = await prisma.pipelineTask.findUnique({ where: { id: taskId } });
        if (!existing) {
          return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const now = new Date();
        const task = await prisma.pipelineTask.update({
          where: { id: taskId },
          data: {
            notes: existing.notes ? `${existing.notes}\n\n${now.toISOString()}: ${note}` : `${now.toISOString()}: ${note}`,
          },
        });

        return NextResponse.json({ success: true, task });
      }

      case 'set_pr': {
        const { taskId, prUrl } = body;
        if (!taskId || !prUrl) {
          return NextResponse.json({ error: 'taskId and prUrl required' }, { status: 400 });
        }

        const task = await prisma.pipelineTask.update({
          where: { id: taskId },
          data: { prUrl },
        });

        return NextResponse.json({ success: true, task });
      }

      case 'run_verification': {
        // Run verification queries for all tasks that have them
        const tasks = await prisma.pipelineTask.findMany({
          where: { verificationQuery: { not: null } },
        });

        const results: Array<{ taskId: string; passed: boolean; result: string }> = [];

        for (const task of tasks) {
          if (!task.verificationQuery) continue;
          try {
            const queryResult = await prisma.$queryRawUnsafe(task.verificationQuery) as unknown[];
            const resultStr = JSON.stringify(queryResult);

            // Simple pass/fail based on target
            let passed = true;
            if (task.verificationTarget) {
              const target = task.verificationTarget;
              const firstRow = queryResult[0] as Record<string, unknown> | undefined;
              const firstValue = firstRow ? Object.values(firstRow)[0] : null;
              const numValue = typeof firstValue === 'bigint' ? Number(firstValue) : typeof firstValue === 'number' ? firstValue : null;

              if (target.startsWith('= ') && numValue !== null) {
                passed = numValue === parseFloat(target.substring(2));
              } else if (target.startsWith('> ') && numValue !== null) {
                passed = numValue > parseFloat(target.substring(2));
              } else if (target.startsWith('< ') && numValue !== null) {
                passed = numValue < parseFloat(target.substring(2));
              } else if (target.startsWith('>= ') && numValue !== null) {
                passed = numValue >= parseFloat(target.substring(3));
              }
            }

            await prisma.pipelineTask.update({
              where: { id: task.id },
              data: {
                lastCheckResult: resultStr.substring(0, 500),
                lastCheckAt: new Date(),
                lastCheckPassed: passed,
                // If a VERIFIED task fails verification, mark as FAILED
                ...(task.status === 'VERIFIED' && !passed ? { status: 'FAILED' as const } : {}),
              },
            });

            results.push({ taskId: task.id, passed, result: resultStr.substring(0, 200) });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Query failed';
            await prisma.pipelineTask.update({
              where: { id: task.id },
              data: {
                lastCheckResult: `ERROR: ${errorMsg}`,
                lastCheckAt: new Date(),
                lastCheckPassed: false,
              },
            });
            results.push({ taskId: task.id, passed: false, result: errorMsg });
          }
        }

        return NextResponse.json({ success: true, results, checkedCount: results.length });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Pipeline Tracker API] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}
