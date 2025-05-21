import { Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3, getSignedUrl } from '../services/s3Service';
import { createJob, updateJob } from '../services/jobService';
import { redisClient, createBullQueue } from '../services/queueService';

// Configure multer for memory storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Initialize job processing queue
const imageQueue = createBullQueue('imageProcessing');

// Handle imagine request
export const imagineRequest = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    if (!req.body.prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    // Generate a unique job ID
    const jobId = uuidv4();

    // Generate a unique filename
    const originalFilename = req.file.originalname || 'image.jpg';
    const key = `uploads/${req.user.id}/${jobId}/${originalFilename}`;

    // Upload the original image to S3
    await uploadToS3(req.file.buffer, key, req.file.mimetype);

    // Get the signed URL for the uploaded image
    const imageUrl = await getSignedUrl(key);

    // Create a job record in the database
    await createJob({
      id: jobId,
      userId: req.user.id,
      status: 'pending',
      type: 'imagine',
      originalImageKey: key,
      prompt: req.body.prompt,
      createdAt: new Date(),
    });

    // Add job to the processing queue
    await imageQueue.add('processImagine', {
      jobId,
      userId: req.user.id,
      imageUrl,
      prompt: req.body.prompt,
    });

    return res.status(202).json({
      message: 'Image processing job created',
      jobId,
    });
  } catch (error) {
    console.error('Error in imagine request:', error);
    return res.status(500).json({ message: 'Failed to process image request' });
  }
};

// Process imagine job in the queue
export const processImagineJob = async (job: any) => {
  const { jobId, userId, imageUrl, prompt } = job.data;

  try {
    // Update job status to processing
    await updateJob(jobId, { status: 'processing' });

    // Call GoAPI Midjourney API to process the image
    const response = await axios.post('https://api.goapi.ai/midjourney/imagine', {
      prompt: prompt,
      imageUrl: imageUrl,
      webhookUrl: `${process.env.API_BASE_URL}/api/webhook`,
      webhookData: { jobId, userId },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.GOAPI_KEY,
      },
    });

    // Update job with API job ID
    await updateJob(jobId, {
      apiJobId: response.data.jobId,
      status: 'awaiting_completion',
    });

    // Store the job info in Redis for webhook matching
    await redisClient.set(`job:${response.data.jobId}`, JSON.stringify({
      jobId,
      userId
    }), 'EX', 60 * 60 * 24); // Expire after 24 hours

    return { success: true };
  } catch (error) {
    console.error('Error processing imagine job:', error);

    // Update job status to failed
    await updateJob(jobId, {
      status: 'failed',
      error: error.message || 'Failed to process image'
    });

    return { success: false, error: error.message };
  }
};
