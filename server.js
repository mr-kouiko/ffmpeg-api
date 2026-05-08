const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Render injecte automatiquement PORT=10000
const PORT = process.env.PORT || 10000;

// ===================== HEALTH CHECK =====================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ffmpeg-api',
    time: new Date().toISOString()
  });
});

// ===================== DOWNLOAD FILE =====================
const downloadFile = async (url, outputPath) => {
  const writer = fs.createWriteStream(outputPath);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

// ===================== CLEANUP =====================
function cleanup(inputPath, outputPath) {
  try {
    if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
}

// ===================== COMPRESS VIDEO =====================
app.post('/compress', async (req, res) => {
  let inputPath, outputPath;

  try {
    const videoUrl = req.body.url;
    if (!videoUrl) {
      return res.status(400).json({ error: 'No URL provided' });
    }

    const id = Date.now();
    inputPath = path.join('/tmp', `input-${id}.mp4`);
    outputPath = path.join('/tmp', `output-${id}.mp4`);

    console.log("Downloading video...");
    await downloadFile(videoUrl, inputPath);

    if (!fs.existsSync(inputPath)) {
      throw new Error("Video download failed");
    }

    console.log("Running FFmpeg compression...");

    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 28',
        '-vf scale=1280:-2',
        '-threads 1',
        '-c:a aac',
        '-b:a 96k',
        '-movflags +faststart'
      ])
      .on('start', cmd => console.log("FFmpeg:", cmd))
      .on('error', err => {
        console.error("FFMPEG ERROR:", err);

        cleanup(inputPath, outputPath);

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: err.message
          });
        }
      })
      .on('end', () => {
        console.log("Compression done");

        res.download(outputPath, () => {
          cleanup(inputPath, outputPath);
        });
      })
      .save(outputPath);

  } catch (err) {
    console.error("SERVER ERROR:", err);

    cleanup(inputPath, outputPath);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ===================== THUMBNAIL (FIXÉ + STABLE RENDER) =====================
app.post('/thumbnail', async (req, res) => {
  let inputPath, outputPath;

  try {
    const videoUrl = req.body.url;

    if (!videoUrl) {
      return res.status(400).json({ error: 'No URL provided' });
    }

    const id = Date.now();
    inputPath = path.join('/tmp', `input-${id}.mp4`);
    outputPath = path.join('/tmp', `thumb-${id}.jpg`);

    console.log("Downloading video for thumbnail...");

    await downloadFile(videoUrl, inputPath);

    if (!fs.existsSync(inputPath)) {
      throw new Error("Download failed");
    }

    console.log("Generating thumbnail...");

    // 🔥 VERSION STABLE POUR RENDER
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['00:00:01'], // stable vs 50%
          filename: path.basename(outputPath),
          folder: '/tmp',
          size: '1280x720'
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error("Thumbnail not created");
    }

    console.log("Thumbnail generated successfully");

    res.download(outputPath, () => {
      cleanup(inputPath, outputPath);
    });

  } catch (err) {
    console.error("THUMBNAIL ERROR:", err);

    cleanup(inputPath, outputPath);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ===================== START SERVER =====================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
