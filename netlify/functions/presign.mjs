import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: 'https://gateway.storjshare.io',
  region: 'global',
  credentials: {
    accessKeyId: process.env.STORJ_ACCESS_KEY,
    secretAccessKey: process.env.STORJ_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.STORJ_BUCKET || 'p2pvideo';

export const handler = async (event) => {
  var h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: h, body: '' };
  var p = event.queryStringParameters || {};
  if (!p.filename || !p.type) return { statusCode: 400, headers: h, body: 'Missing params' };
  var safe = p.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  var key = 'videos/' + Date.now() + '-' + safe;
  try {
    var cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: p.type });
    var uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    var publicUrl = 'https://link.storjshare.io/s/' + process.env.STORJ_SHARE_TOKEN + '/' + BUCKET + '/' + key;
    return { statusCode: 200, headers: h, body: JSON.stringify({ uploadUrl, publicUrl, key }) };
  } catch (err) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) };
  }
};
