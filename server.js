const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

const API_KEY = process.env.FFMPEG_API_KEY;

app.post('/process', upload.single('video'), (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No video uploaded' });
  }

  const inputPath = req.file.path;
  const outputPath = `output-${Date.now()}.mp4`;

  ffmpeg(inputPath)
    .outputOptions([
      '-vf scale=320:-1',
      '-t 5'
    ])
    .save(outputPath)
    .on('end', () => {
      res.download(outputPath, () => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    })
    .on('error', (err) => {
      console.error(err);
      res.status(500).send('Error processing video');
    });
});

app.get('/', (req, res) => {
  res.send('FFmpeg API is running 🚀');
});

app.listen(3000, () => {
  console.log('FFmpeg API running on port 3000');
});