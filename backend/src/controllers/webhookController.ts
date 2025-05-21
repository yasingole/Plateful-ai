import { Request, Response } from 'express';
import { redisClient } from '../services/queueService';
import { updateJob, getJob } from '../services/jobService';
import { uploadToS3, getSignedUrl } from '../services/s3Service';
import axios from 'axios';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    // Validate webhook data
    if (!webhookData || !webhookData.jobId || !webhookData.status) {
      return res.status(400).json({ message: 'Invalid webhook data' });
    }

    // Get stored job info from Redis
    const jobInfoJson = await redisClient.get(`job:${webhookData.jobId}`);

    if (!jobInfoJson) {
      console.error('Job not found in Redis:', webhookData.jobId);
      return res.status(404).json({ message: 'Job not found' });
    }

    const jobInfo = JSON.parse(jobInfoJson);

    // Get job from database
    const job = await getJob(jobInfo.jobId);

    if (!job) {
      console.error('Job not found in database:', jobInfo.jobId);
      return res.status(404).json({ message: 'Job not found' });
    }

    // Update job status based on webhook data
    if (webhookData.status === 'completed') {
      // Download and store all generated images
      const resultImageKeys = [];

      if (webhookData.images && Array.isArray(webhookData.images)) {
        for (let i = 0; i < webhookData.images.length; i++) {
          const imageUrl = webhookData.images[i];

          // Download image from URL
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

          // Upload to S3
          const key = `results/${jobInfo.userId}/${jobInfo.jobId}/result_${i + 1}.jpg`;
          await uploadToS3(response.data, key, 'image/jpeg');

          resultImageKeys.push(key);
        }
      }

      // Update job with result images
      await updateJob(jobInfo.jobId, {
        status: 'completed',
        resultImageKeys,
        completedAt: new Date(),
      });
    } else if (webhookData.status === 'failed') {
      await updateJob(jobInfo.jobId, {
        status: 'failed',
        error: webhookData.error || 'Job failed',
        completedAt: new Date(),
      });
    } else {
      // Update status for other statuses (processing, etc.)
      await updateJob(jobInfo.jobId, {
        status: webhookData.status,
      });
    }

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ message: 'Failed to process webhook' });
  }
};
