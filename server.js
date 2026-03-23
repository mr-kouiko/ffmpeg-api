const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('FFmpeg API running');
});

app.post('/compress', async (req, res) => {
  let inputPath = null;
  let outputPath = null;

  try {
    const videoUrl = req.body.url;

    if (!videoUrl) {
      return res.status(400).json({ error: 'No URL provided' });
    }

    inputPath = `input-${Date.now()}.mp4`;
    outputPath = `output-${Date.now()}.mp4`;

    // 📥 DOWNLOAD VIDEO (avec timeout)
    const writer = fs.createWriteStream(inputPath);

    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 20000
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log('Video downloaded:', fs.existsSync(inputPath));

    // 🎬 FFMPEG SAFE (ANTI CRASH RAILWAY)
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 28',
        '-vf scale=1280:-2',
        '-threads 1',
        '-max_muxing_queue_size 1024',
        '-c:a aac',
        '-b:a 96k',
        '-movflags +faststart'
      ])
      .on('start', (cmd) => {
        console.log('FFmpeg command:', cmd);
      })
      .on('stderr', (line) => {
        console.log('FFmpeg:', line);
      })
      .on('end', () => {
        console.log('Compression finished');

        res.download(outputPath, () => {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg ERROR:', err);

        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        if (!res.headersSent) {
          res.status(500).json({ error: 'FFmpeg failed' });
        }
      })
      .save(outputPath);

  } catch (err) {
    console.error('SERVER ERROR:', err);

    if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
