const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

// Configure AWS S3 client
const s3Client = new S3Client({
  region: 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function uploadVideo() {
  const filePath = '/Users/rodolfo/Downloads/5079159-uhd_3840_2160_24fps.mp4';
  const bucketName = 'avenida-legal-videos';
  const keyName = 'hero-video.mp4';

  try {
    // Read the file
    const fileContent = fs.readFileSync(filePath);
    
    // Upload parameters
    const uploadParams = {
      Bucket: bucketName,
      Key: keyName,
      Body: fileContent,
      ContentType: 'video/mp4',
      ACL: 'public-read' // Make it publicly accessible
    };

    console.log('Uploading video to S3...');
    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);
    console.log('Upload successful:', `https://${bucketName}.s3.us-west-1.amazonaws.com/${keyName}`);
    
  } catch (error) {
    console.error('Error uploading video:', error);
  }
}

uploadVideo();
