const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(express.json());

const API_KEY = process.env.FFMPEG_API_KEY;

app.post('/process', async (req, res) => {
  try {
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

    // Télécharger la vidéo
    const videoResponse = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
    });

    const videoWriter = fs.createWriteStream(inputPath);
    videoResponse.data.pipe(videoWriter);

    await new Promise((resolve) => videoWriter.on('finish', resolve));

    // Télécharger watermark si fourni
    if (watermarkUrl) {
      const watermarkResponse = await axios({
        method: 'GET',
        url: watermarkUrl,
        responseType: 'stream',
      });

      const watermarkWriter = fs.createWriteStream(watermarkPath);
      watermarkResponse.data.pipe(watermarkWriter);

      await new Promise((resolve) => watermarkWriter.on('finish', resolve));
    }

    // FFmpeg
    let command = ffmpeg(inputPath).outputOptions([
      '-c:v libx264',
      '-preset fast',
      '-crf 23',
      '-c:a aac',
      '-movflags +faststart'
    ]);

    if (watermarkUrl) {
      command = command.complexFilter([
        {
          filter: 'overlay',
          options: {
            x: '(main_w-overlay_w)/2',
            y: '(main_h-overlay_h)/2'
          }
        }
      ]).input(watermarkPath);
    }

    command
      .save(outputPath)
      .on('end', () => {
        res.download(outputPath, () => {
          fs.unlinkSync(inputPath);
          if (fs.existsSync(watermarkPath)) fs.unlinkSync(watermarkPath);
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', (err) => {
        console.error(err);
        res.status(500).send('FFmpeg error');
      });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.get('/', (req, res) => {
  res.send('FFmpeg API is running 🚀');
});

app.listen(3000, () => {
  console.log('FFmpeg API running on port 3000');
});
