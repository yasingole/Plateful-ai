import { Request, Response } from 'express';
import { getJob, getJobs } from '../services/jobService';
import { getSignedUrl } from '../services/s3Service';

// Get job status
export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Get job data
    const job = await getJob(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Verify job belongs to the authenticated user
    if (job.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized access to job' });
    }

    // Generate signed URLs for original and result images
    let originalImageUrl = null;
    let resultImageUrls = [];

    if (job.originalImageKey) {
      originalImageUrl = await getSignedUrl(job.originalImageKey);
    }

    if (job.resultImageKeys && Array.isArray(job.resultImageKeys)) {
      for (const key of job.resultImageKeys) {
        const url = await getSignedUrl(key);
        resultImageUrls.push(url);
      }
    }

    return res.status(200).json({
      job: {
        id: job.id,
        status: job.status,
        type: job.type,
        prompt: job.prompt,
        originalImageUrl,
        resultImageUrls,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
      }
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return res.status(500).json({ message: 'Failed to get job status' });
  }
};

// Get user's job history
export const getJobHistory = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    // Get jobs for the authenticated user
    const jobs = await getJobs({
      userId: req.user.id,
      status: status as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });

    return res.status(200).json({
      jobs: jobs.map(job => ({
        id: job.id,
        status: job.status,
        type: job.type,
        prompt: job.prompt,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      })),
    });
  } catch (error) {
    console.error('Error getting job history:', error);
    return res.status(500).json({ message: 'Failed to get job history' });
  }
};
