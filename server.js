const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===================== HEALTH CHECK =====================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ffmpeg-api',
    time: new Date().toISOString()
  });
});

// ===================== UTIL: DOWNLOAD FILE =====================
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

    // 📥 Download
    await downloadFile(videoUrl, inputPath);
    console.log('Video downloaded:', inputPath);

    // 🎬 FFmpeg process
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
      .on('start', (cmd) => {
        console.log('FFmpeg command:', cmd);
      })
      .on('error', (err) => {
        console.error('FFmpeg ERROR:', err);

        cleanup(inputPath, outputPath);

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'FFmpeg failed',
            details: err.message
          });
        }
      })
      .on('end', () => {
        console.log('Compression finished');

        res.download(outputPath, () => {
          cleanup(inputPath, outputPath);
        });
      })
      .save(outputPath);

  } catch (err) {
    console.error('SERVER ERROR:', err);

    cleanup(inputPath, outputPath);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: err.message
      });
    }
  }
});

// ===================== THUMBNAIL (FIXED + REQUIRED FOR YOUR PIPELINE) =====================
app.post('/thumbnail', async (req, res) => {
  let inputPath, outputPath;

  try {
    const videoUrl = req.body.url;

    if (!videoUrl) {
      return res.status(400).json({ error: 'No URL provided' });
    }

    const id = Date.now();
    inputPath = path.join('/tmp', `thumb-input-${id}.mp4`);
    outputPath = path.join('/tmp', `thumb-${id}.jpg`);

    // 📥 Download video
    await downloadFile(videoUrl, inputPath);
    console.log('Thumbnail input downloaded:', inputPath);

    // 📸 Extract frame (thumbnail)
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['50%'],
        filename: path.basename(outputPath),
        folder: '/tmp',
        size: '1280x720'
      })
      .on('end', () => {
        console.log('Thumbnail generated');

        res.download(outputPath, () => {
          cleanup(inputPath, outputPath);
        });
      })
      .on('error', (err) => {
        console.error('THUMBNAIL ERROR:', err);

        cleanup(inputPath, outputPath);

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Thumbnail failed',
            details: err.message
          });
        }
      });

  } catch (err) {
    console.error('SERVER ERROR:', err);

    cleanup(inputPath, outputPath);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: err.message
      });
    }
  }
});

// ===================== CLEANUP =====================
function cleanup(inputPath, outputPath) {
  try {
    if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

// ===================== START =====================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
