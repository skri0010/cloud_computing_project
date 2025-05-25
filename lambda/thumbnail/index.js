const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const sharp = require("sharp");

const s3 = new S3Client({ region: "us-east-1" });

exports.handler = async (event) => {
  try {
    // EventBridge format
    const bucket = event.detail.bucket.name;
    const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, " "));

    // Optional: skip non-image files
    if (!key.match(/\.(jpg|jpeg|png|webp)$/i)) {
      console.log("Not an image file. Skipping.");
      return;
    }

    const thumbnailKey = `thumbnails/${key.split("/").pop()}`;

    // 1. Get the original image
    const originalImage = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    const imageBuffer = await streamToBuffer(originalImage.Body);

    // 2. Create a thumbnail with Sharp
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize({ width: 150 })
      .jpeg() // You can change this to .png() if needed
      .toBuffer();

    // 3. Upload the thumbnail
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: "image/jpeg",
      })
    );

    console.log(`✅ Thumbnail saved at: ${thumbnailKey}`);
    return { statusCode: 200 };
  } catch (err) {
    console.error("❌ Error generating thumbnail:", err);
    return { statusCode: 500, body: "Failed to generate thumbnail." };
  }
};

// Helper to convert stream to buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
