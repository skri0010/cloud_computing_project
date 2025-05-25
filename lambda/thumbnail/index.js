const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const sharp = require("sharp");

const s3 = new S3Client();

exports.handler = async (event) => {
  const record = event.Records[0];
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

  // Only process images (optional safety)
  if (!key.match(/\.(jpg|jpeg|png|webp)$/i)) {
    console.log("Not an image file. Skipping.");
    return;
  }

  const thumbnailKey = `thumbnails/${key.split("/").pop()}`;

  try {
    // 1. Get the original image
    const originalImage = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    const imageBuffer = await streamToBuffer(originalImage.Body);

    // 2. Create a thumbnail with Sharp
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize({ width: 150 })
      .toBuffer();

    // 3. Upload the thumbnail
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: "image/jpeg", // or infer from original if needed
      })
    );

    console.log(`Thumbnail saved at: ${thumbnailKey}`);
  } catch (err) {
    console.error("Error generating thumbnail:", err);
    throw err;
  }
};

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
