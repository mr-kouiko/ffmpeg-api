FROM node:18

# Installer ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Render utilise 10000
EXPOSE 10000

CMD ["node", "server.js"]
