import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { createRedisConnection } from '@experience-marketplace/jobs';

// Create a shared Redis connection
const redisConnection = createRedisConnection();

// Helper to safely convert progress to number
function getProgressNumber(progress: any): number {
  if (typeof progress === 'number') return progress;
  if (typeof progress === 'string') return parseFloat(progress) || 0;
  return 0;
}

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface JobInfo {
  id: string;
  name: string;
  data: any;
  progress: number;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queueName = searchParams.get('queue');
    const jobStatus = searchParams.get('status') || 'waiting';

    // Define all queues in the system
    const queueNames = [
      'keyword-research',
      'content-generation',
      'domain-registration',
      'site-deployment',
      'seo-optimization',
    ];

    if (queueName) {
      // Get details for a specific queue
      const queue = new Queue(queueName, { connection: redisConnection });

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      const isPaused = await queue.isPaused();

      // Get recent jobs based on status
      let jobs: JobInfo[] = [];
      if (jobStatus === 'waiting') {
        const waitingJobs = await queue.getWaiting(0, 50);
        jobs = waitingJobs.map((job) => ({
          id: job.id || 'unknown',
          name: job.name,
          data: job.data,
          progress: getProgressNumber(job.progress),
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        }));
      } else if (jobStatus === 'active') {
        const activeJobs = await queue.getActive(0, 50);
        jobs = activeJobs.map((job) => ({
          id: job.id || 'unknown',
          name: job.name,
          data: job.data,
          progress: getProgressNumber(job.progress),
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
        }));
      } else if (jobStatus === 'completed') {
        const completedJobs = await queue.getCompleted(0, 50);
        jobs = completedJobs.map((job) => ({
          id: job.id || 'unknown',
          name: job.name,
          data: job.data,
          progress: 100,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
        }));
      } else if (jobStatus === 'failed') {
        const failedJobs = await queue.getFailed(0, 50);
        jobs = failedJobs.map((job) => ({
          id: job.id || 'unknown',
          name: job.name,
          data: job.data,
          progress: getProgressNumber(job.progress),
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
        }));
      }

      return NextResponse.json({
        queue: {
          name: queueName,
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused: isPaused,
        },
        jobs,
      });
    }

    // Get stats for all queues
    const queueStats: QueueStats[] = await Promise.all(
      queueNames.map(async (name) => {
        const queue = new Queue(name, { connection: redisConnection });

        const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.isPaused(),
        ]);

        return {
          name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused: isPaused,
        };
      })
    );

    // Calculate aggregate stats
    const totalStats = queueStats.reduce(
      (acc, queue) => ({
        waiting: acc.waiting + queue.waiting,
        active: acc.active + queue.active,
        completed: acc.completed + queue.completed,
        failed: acc.failed + queue.failed,
        delayed: acc.delayed + queue.delayed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    );

    return NextResponse.json({
      queues: queueStats,
      totals: totalStats,
    });
  } catch (error) {
    console.error('[API] Error fetching queue stats:', error);
    return NextResponse.json({ error: 'Failed to fetch queue stats' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, queueName, jobId } = body;

    const queue = new Queue(queueName, { connection: redisConnection });

    if (action === 'pause') {
      await queue.pause();
      return NextResponse.json({ success: true, message: `Queue ${queueName} paused` });
    } else if (action === 'resume') {
      await queue.resume();
      return NextResponse.json({ success: true, message: `Queue ${queueName} resumed` });
    } else if (action === 'retry' && jobId) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.retry();
        return NextResponse.json({ success: true, message: `Job ${jobId} retried` });
      }
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    } else if (action === 'remove' && jobId) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        return NextResponse.json({ success: true, message: `Job ${jobId} removed` });
      }
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    } else if (action === 'clean') {
      // Clean old completed and failed jobs
      const grace = 24 * 60 * 60 * 1000; // 24 hours
      await queue.clean(grace, 1000, 'completed');
      await queue.clean(grace, 1000, 'failed');
      return NextResponse.json({ success: true, message: `Queue ${queueName} cleaned` });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] Error performing queue action:', error);
    return NextResponse.json({ error: 'Failed to perform queue action' }, { status: 500 });
  }
}
