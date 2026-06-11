require('dotenv').config();

const fs = require('fs');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function test() {

    const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(
            'uploads/d68d1702-affc-4c96-b05e-0e3e6f96a268/vipul_bajaj-1781089942233.webm'
        ),
        model: 'whisper-large-v3'
    });

    console.log(transcription.text);
}

test().catch(console.error);