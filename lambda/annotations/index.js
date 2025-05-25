const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const mysql = require("mysql2/promise");
const axios = require("axios");

const secretsClient = new SecretsManagerClient({ region: "us-east-1" });

exports.handler = async (event) => {
  try {
    let bucket = "";
    let key = "";
    if (event.detail) {
      // EventBridge event format
      bucket = event.detail.bucket.name;
      key = decodeURIComponent(event.detail.object.key.replace(/\+/g, " "));
    } else {
      throw new Error("Unsupported event format");
    }
    const objectUrl = `https://${bucket}.s3.amazonaws.com/${key}`;

    // 1. Retrieve DB and Gemini secrets
    const { DB_HOST, DB_USER, DB_PASS, DB_NAME, GEMINI_API_KEY } =
      await getSecrets("app/secrets");

    // 2. Annotate with Gemini
    const annotation = await getAnnotationFromGemini(
      objectUrl,
      GEMINI_API_KEY || "AIzaSyAdTBe0-fVcvf19x-2gxHeI8a8NwRrQqGA"
    );

    // 3. Insert into RDS
    const connection = await mysql.createConnection({
      host: DB_HOST || "i-upload.cxyayggkaml9.us-east-1.rds.amazonaws.com",
      user: DB_USER || "admin",
      password: DB_PASS || "password123",
      database: DB_NAME || "test",
    });

    const [result] = await connection.execute(
      "UPDATE images SET caption = ? WHERE s3_key = ?",
      [annotation, key]
    );

    if (result.affectedRows === 0) {
      throw new Error("No image record found to update.");
    }

    await connection.end();

    console.log("Annotation stored successfully.");
    return { statusCode: 200 };
  } catch (err) {
    console.error("Error processing annotation:", err);
    return { statusCode: 500, body: "Failed to process annotation." };
  }
};

async function getSecrets(secretName) {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const data = await secretsClient.send(command);
  return JSON.parse(data.SecretString);
}

async function getAnnotationFromGemini(imageUrl, apiKey) {
  const body = {
    contents: [
      {
        parts: [
          { text: "Describe the image in detail." },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: await downloadBase64Image(imageUrl),
            },
          },
        ],
      },
    ],
  };

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
    body,
    { params: { key: apiKey } }
  );

  const annotation = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return annotation || "No annotation generated.";
}

async function downloadBase64Image(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
  return Buffer.from(response.data, "binary").toString("base64");
}
