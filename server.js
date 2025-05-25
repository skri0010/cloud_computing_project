const express = require("express");
const multer = require("multer");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
const port = 3000;
const upload = multer({ dest: "uploads/" });

// Get secrets from Secrets Manager
const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
const getSecrets = async (secretName) => {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString);
};

// Main async wrapper
(async () => {
  const secrets = await getSecrets("app/secrets");

  const dbConfig = {
    host: secrets.DB_HOST,
    user: secrets.DB_USER,
    password: secrets.DB_PASS,
    database: secrets.DB_NAME,
  };

  const s3Client = new S3Client({
    region: "us-east-1",
  });
  const s3Bucket = secrets.S3_BUCKET;

  app.use(express.static("public"));
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.post("/upload", upload.single("image"), async (req, res) => {
    const file = req.file;
    const caption = "";
    const timestamp = new Date();
    const s3Key = `images/${Date.now()}_${file.originalname}`;
    const fileContent = fs.readFileSync(file.path);

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: fileContent,
      ContentType: file.mimetype,
    });
    await s3Client.send(uploadCommand);

    // Store metadata in RDS
    const connection = await mysql.createConnection(dbConfig);
    await connection.execute(
      "INSERT INTO images (filename, s3_key, caption, uploaded_at) VALUES (?, ?, ?, ?)",
      [file.originalname, s3Key, caption, timestamp]
    );
    await connection.end();

    fs.unlinkSync(file.path);
    res.redirect("/images");
  });

  app.get("/images", async (req, res) => {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM images ORDER BY uploaded_at DESC"
    );
    await connection.end();

    const imageTags = rows
      .map((img) => {
        const imageURL = `https://${s3Bucket}.s3.amazonaws.com/${img.s3_key}`;
        const thumbURL = `https://${s3Bucket}.s3.amazonaws.com/thumbnails/${img.s3_key
          .split("/")
          .pop()}`;
        return `
      <div class="card">
        <div class="caption">${img.caption}</div>
        <img src="${imageURL}" alt="Image"/>
        <br/>
        <img src="${thumbURL}" alt="Thumbnail" style="margin-top:10px; width: 120px;"/>
      </div>
    `;
      })
      .join("");

    res.send(`
        <html>
            <head>
            <title>Uploaded Images</title>
            <style>
                body {
                font-family: Arial, sans-serif;
                background: #f9f9f9;
                padding: 30px;
                }

                h1 {
                text-align: center;
                color: #333;
                }

                .gallery {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                justify-content: center;
                }

                .card {
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                padding: 16px;
                text-align: center;
                width: 320px;
                }

                .card img {
                max-width: 100%;
                border-radius: 4px;
                }

                .caption {
                font-weight: bold;
                margin: 10px 0;
                }

                .back {
                display: block;
                margin: 40px auto 0;
                text-align: center;
                text-decoration: none;
                color: #007bff;
                font-weight: bold;
                }

                .back:hover {
                text-decoration: underline;
                }
            </style>
            </head>
            <body>
            <h1>Uploaded Images</h1>
            <div class="gallery">
                ${imageTags}
            </div>
            <a href="/" class="back">Upload another image</a>
            </body>
        </html>
`);
  });

  app.get("/health", (req, res) => {
    res.sendStatus(200);
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${port}`);
  });
})();
