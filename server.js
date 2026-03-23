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

app.get('/', (req, res) => {
  res.send('FFmpeg API running');
});

app.post('/compress', async (req, res) => {
  try {
    const videoUrl = req.body.url;

    if (!videoUrl) {
      return res.status(400).json({ error: 'No URL provided' });
    }

    const inputPath = `input-${Date.now()}.mp4`;
    const outputPath = `output-${Date.now()}.mp4`;

    // 📥 DOWNLOAD VIDEO
    const writer = fs.createWriteStream(inputPath);
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log('Video downloaded:', fs.existsSync(inputPath));

    // 🎬 FFMPEG (VERSION OPTIMISÉE POUR RAILWAY)
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',     // ⚡ moins de CPU
        '-crf 28',               // ⚡ compression + forte
        '-vf scale=1280:-2',     // ⚡ 720p
        '-threads 1',            // ⚡ évite SIGKILL
        '-c:a aac',
        '-b:a 96k',
        '-movflags +faststart'
      ])
      .on('start', (cmd) => {
        console.log('FFmpeg command:', cmd);
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine);
      })
      .on('end', () => {
        console.log('Compression finished');

        res.download(outputPath, () => {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg ERROR:', err);

        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        res.status(500).json({ error: 'FFmpeg failed' });
      })
      .save(outputPath);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
