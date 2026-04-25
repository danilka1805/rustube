import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'https://' + process.env.CF_ACCOUNT_ID + '.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    var { key } = JSON.parse(event.body || '{}');
    if (!key) return { statusCode: 400, body: 'Missing key' };
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET || 'videos', Key: key }));
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
