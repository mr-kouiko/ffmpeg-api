const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const axios = require('axios');
const cors = require('cors');

const app = express();

// ✅ CORS
app.use(cors());

// ✅ JSON parsing
app.use(express.json());

const API_KEY = process.env.FFMPEG_API_KEY;

app.post('/process', async (req, res) => {
  try {
    // ✅ Vérif API key
    if (req.headers['x-api-key'] !== API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { videoUrl, watermarkUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing videoUrl' });
    }

    const inputPath = `input-${Date.now()}.mp4`;
    const watermarkPath = `watermark-${Date.now()}.png`;
    const outputPath = `output-${Date.now()}.mp4`;

    // ✅ DOWNLOAD VIDEO (FIX COMPLET)
    const videoResponse = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const videoWriter = fs.createWriteStream(inputPath);

    await new Promise((resolve, reject) => {
      videoResponse.data.pipe(videoWriter);
      videoWriter.on('finish', resolve);
      videoWriter.on('error', reject);
    });

    // 🔥 IMPORTANT (Railway fix)
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Video downloaded:", fs.existsSync(inputPath));

    // ✅ DOWNLOAD WATERMARK (optionnel)
    if (watermarkUrl) {
      const watermarkResponse = await axios({
        method: 'GET',
        url: watermarkUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const watermarkWriter = fs.createWriteStream(watermarkPath);

      await new Promise((resolve, reject) => {
        watermarkResponse.data.pipe(watermarkWriter);
        watermarkWriter.on('finish', resolve);
        watermarkWriter.on('error', reject);
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      console.log("Watermark downloaded:", fs.existsSync(watermarkPath));
    }

    // ✅ FFMPEG
    let command = ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-movflags +faststart'
      ]);

    if (watermarkUrl) {
      command = command
        .input(watermarkPath)
        .complexFilter([
          {
            filter: 'overlay',
            options: {
              x: '(main_w-overlay_w)/2',
              y: '(main_h-overlay_h)/2'
            }
          }
        ]);
    }

    command
      .on('start', (cmd) => {
        console.log("FFmpeg command:", cmd);
      })
      .on('stderr', (stderrLine) => {
        console.log("FFmpeg stderr:", stderrLine);
      })
      .on('error', (err) => {
        console.error("FFmpeg ERROR:", err);
        res.status(500).send('FFmpeg error');
      })
      .on('end', () => {
        console.log("FFmpeg DONE");

        res.download(outputPath, () => {
          try {
            fs.unlinkSync(inputPath);
            if (fs.existsSync(watermarkPath)) fs.unlinkSync(watermarkPath);
            fs.unlinkSync(outputPath);
          } catch (e) {
            console.log("Cleanup error:", e);
          }
        });
      })
      .save(outputPath);

  } catch (err) {
    console.error("GLOBAL ERROR:", err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.get('/', (req, res) => {
  res.send('FFmpeg API is running 🚀');
});

app.listen(3000, () => {
  console.log('FFmpeg API running on port 3000');
});
