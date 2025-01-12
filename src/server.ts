import Fastify, { FastifyReply, FastifyRequest } from 'fastify'
import fastifyMultipart, { MultipartFile } from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'

interface MusicData {
  id: string,
  name: string,
  author: string,
  duration: string,
  coverPath: string,
  audioPath: string,
}

const fastify = Fastify({ logger: true })

async function start() {
  await fastify.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST'],
  })

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 250 * 1024 * 1024,
    }
  })

  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/'
  })

  try {
    await fastify.listen({ port: 3333 })
    console.log('Server running on port 3333')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

async function processFile(part: MultipartFile, subFolder: string): Promise<string> {
  const extension = path.extname(part.filename)
  const filename = `${randomUUID()}${extension}`
  const folderPath = path.join(__dirname, 'uploads', subFolder)

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
  }

  const filepath = path.join(folderPath, filename)

  await pipeline(part.file, createWriteStream(filepath))

  return filename
}

fastify.post('/api/upload-music', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const files: Record<string, string> = {}
    const formData: Record<string, string> = {}

    const parts = request.parts()

    for await (const part of parts) {
      if (part.type === 'file') {
        const subFolder = part.fieldname === 'audio' ? 'music' : 'images'
        const filename = await processFile(part, subFolder)
        files[part.fieldname] = filename
      } else {
        formData[part.fieldname] = part.value as string
      }
    }

    const uploadsDir = path.join(__dirname, 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const coverFilename = files.cover ? `/uploads/images/${files.cover}` : `/uploads/images/default.png`

    if (!files.audio) {
      throw new Error('Missing required audio file')
    }

    const dataPath = './user-data.json'
    let musics: MusicData[] = []

    if (fs.existsSync(dataPath)) {
      const fileContent = fs.readFileSync(dataPath, 'utf-8')
      musics = JSON.parse(fileContent)
    }

    const newMusic: MusicData = {
      id: randomUUID(),
      name: formData['music-name'] || 'Unknown Title',
      author: formData['music-author'] || 'Unknown Author',
      duration: formData['music-duration'] || '0:00',
      coverPath: coverFilename,
      audioPath: `/uploads/music/${files.audio}`
    }

    musics.push(newMusic)

    fs.writeFileSync(dataPath, JSON.stringify(musics, null, 2))

    return {
      message: 'Music uploaded successfully',
      music: newMusic
    }

  } catch (error) {
    request.log.error(error)
    throw error
  }
})

fastify.get('/api/musics', async () => {
  try {
    const dataPath = './user-data.json'
    if (fs.existsSync(dataPath)) {
      const fileContent = fs.readFileSync(dataPath, 'utf-8')
      return JSON.parse(fileContent);
    }
    return [];
  } catch (error) {
    fastify.log.error(error)
    throw error
  }
})

start()