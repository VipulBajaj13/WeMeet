require('dotenv').config();
const express = require("express");
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const passportSetup = require('./config/passport-setup');
const mongoose = require('mongoose');
const Transcript = require('./models/transcript');
const MeetingSummary =
    require('./models/meetingSummary');
const keys = require('./config/keys');
const cookieSession = require('cookie-session');
const passport = require('passport');
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const {v4:uuidV4} = require('uuid');
const {ExpressPeerServer} = require('peer');
const Groq = require('groq-sdk');

const peerServer = ExpressPeerServer(server, {
    debug: true
});

const roomHosts = {};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}.webm`);
    }
});

const upload = multer({ storage });

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/peerjs', peerServer);

app.use(cookieSession({
    maxAge: 24*60*60*1000,
    keys: [keys.session.cookieKey]
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(keys.mongodb.dbURI, () => {
    console.log('connected to mongodb');
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile'],
    prompt: 'select_account'
}));

app.get('/logout', (req, res) => {
    req.logout();
    req.session = null;
    res.redirect('/');
});

app.get('/auth/google/redirect', passport.authenticate('google'), (req, res) => {
    const redirectTo = req.session && req.session.returnTo ? req.session.returnTo : '/home';
    if (req.session) {
        delete req.session.returnTo;
    }
    res.redirect(redirectTo);
});

const authCheck = (req, res, next) => {
    const ext = path.extname(req.path);
    if (ext) {
        return next();
    }

    if (!req.user) {
        req.session.returnTo = req.originalUrl || '/';
        return res.redirect('/auth/google');
    }
    next();
};

app.get('/home', authCheck, (req, res) => {
    res.render('home', { user: req.user });
});

app.get('/room', (req, res) => {
    const freshRoomId = uuidV4();
    roomHosts[roomId] = req.user._id;
    res.redirect(`/${freshRoomId}`);
});

app.get('/new', (req, res) => {
    const freshRoomId = uuidV4();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/${freshRoomId}`;
    res.json({ link });
});

app.post('/generate-summary', async (req, res) => {
    try {

        const { roomId } = req.body;

        const transcripts =
            await Transcript.find({ roomId });

        console.log('Found transcripts:',
            transcripts.length);

        const combinedTranscript = transcripts
            .map(t => `${t.user}: ${t.transcript}`)
            .join('\n\n');

        console.log('COMBINED TRANSCRIPT:\n');
        console.log(combinedTranscript);

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `
You are an expert meeting assistant.

Analyze the meeting transcript and return ONLY valid JSON.

Rules:
- No markdown
- No explanations
- No code blocks
- No text outside JSON
- Understand English, Hindi and Hinglish
- Extract important discussion points
- Extract actionable tasks and owners if mentioned
- Do NOT say "insufficient content" unless truly empty
- Clean and correct grammar
- Preserve meaning even if speech is broken
- Infer context from partial sentences
- In summary, return 3-5 bullet points
- In actionItems, clear tasks with owner if mentioned

Return exactly in this format:

{
  "summary": [
    "point 1",
    "point 2",
    "point 3"
  ],
  "actionItems": [
    "owner: task",
    "owner: task"
  ]
}           

IMPORTANT:
- If a participant name appears in the transcript, copy it character-for-character.
- Do not fix spelling.
- Do not transliterate.
- Do not infer a more likely name.
- Do not replace usernames with real names.
`
                },
                {
                    role: "user",
                    content: combinedTranscript
                }
            ]
        });

        const aiResponse =
            completion.choices[0].message.content;

        const parsed = JSON.parse(aiResponse);

        const summary = parsed.summary || [];

        const actionItems = parsed.actionItems || [];

        await MeetingSummary.create({
            roomId,
            summary,
            actionItems
        });

        res.json({
            success: true,
            summary,
            actionItems
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/meeting-summary/:roomId', async (req, res) => {

    const roomId = req.params.roomId;

    const summaryDoc =
        await MeetingSummary.findOne({ roomId });

    if (!summaryDoc) {
        return res.send("No summary found");
    }

    res.render('summary', {
        roomId,
        summary: summaryDoc.summary,
        actionItems: summaryDoc.actionItems
    });
});

app.get('/:room', authCheck, (req, res) => {
    const userName = req.user && req.user.username ? req.user.username : 'Anonymous';
    const isHost = roomHosts[req.params.room] === req.user._id;
    res.render('room', { roomId: req.params.room, user: userName, isHost });
});

async function transcribeAudio(filePath) {
    const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3",
        language: "en"
    });

    return transcription.text;
}

app.post('/transcribe', (req, res, next) => {
    const roomId = req.query.roomId || 'unknown-room';
    const userName = req.query.userName || 'anonymous';

    upload.single('audio')(req, res, async (err) => {
        // ignore 'Request aborted' runtime aborts; if no req.file then handle later
        if (err && err.message !== 'Request aborted' && !req.file) {
            console.error('Upload error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        try {
            let filePath = req.file?.path;

            // fallback: if multer didn't set req.file (aborted stream) use newest file
            if (!filePath) {
                const files = fs.readdirSync('uploads/').sort((a, b) => {
                    const statA = fs.statSync(path.join('uploads/', a));
                    const statB = fs.statSync(path.join('uploads/', b));
                    return statB.mtime - statA.mtime; // newest first
                });

                if (files.length > 0) {
                    filePath = path.join('uploads/', files[0]);
                    console.log('Using most recent file:', filePath);
                } else {
                    return res.status(400).json({ success: false, error: 'No file uploaded' });
                }
            }

            const roomDir = path.join('uploads', roomId);

            if (!fs.existsSync(roomDir)) {
                fs.mkdirSync(roomDir, { recursive: true });
            }

            const safeUserName = userName.replace(/[^a-zA-Z0-9-_]/g, '_');

            const newFilename =
                `${safeUserName}-${Date.now()}.webm`;

            const newPath =
                path.join(roomDir, newFilename);

            console.log('Renaming to:', newPath);
            fs.renameSync(filePath, newPath);
            console.log('Saved successfully:', newPath);

            console.log('Room:', roomId);
            console.log('User:', userName);
            console.log('Final file:', newPath);

            const transcriptText = await transcribeAudio(newPath);

            console.log('TRANSCRIPT:');
            console.log(transcriptText);

            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `
You are an expert meeting assistant.

Rules:
- Do NOT say "insufficient content" unless truly empty
- Clean and correct grammar
- Understand Hinglish (Hindi + English mix)
- Preserve meaning even if speech is broken
- Infer context from partial sentences

Return STRICT format:

SUMMARY:
- 3-5 bullet points

ACTION ITEMS:
- Clear tasks with owner if mentioned
`
                    },
                    {
                        role: "user",
                        content: transcriptText
                    }
                ]
            });

            const aiResponse =
                completion.choices[0].message.content;

            console.log('AI RESPONSE:');
            console.log(aiResponse);

            await Transcript.create({
                roomId,
                user: userName,
                transcript: transcriptText
            });

            console.log('Transcript saved to MongoDB');

            res.json({
                success: true,
                file: newFilename
            });
        } catch (err) {
            console.error('File error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
});

let connectboard = [];

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.broadcast.to(roomId).emit('user-connected', userId);
        socket.on('message', message => {
            io.to(roomId).emit('createMessage', message);
        });
        connectboard.push(socket);
        console.log(`${socket.id} has connected`);

        socket.on('draw', (data) => {
            socket.broadcast.to(roomId).emit('ondraw', data);
        });

        socket.on('down', (data) => {
            socket.broadcast.to(roomId).emit('ondown', data);
        });

        socket.on('endcall', () => {
            console.log('endcall received from socket.id:', socket.id);
            socket.to(roomId).emit('user-disconnected', userId);
        });

        socket.on('disconnect', (reason) => {
            console.log(`${socket.id} is disconnected`);
            socket.to(roomId).emit('user-disconnected', userId);
            connectboard = connectboard.filter((con) => con.id !== socket.id);
        });
    });
});

server.listen(process.env.PORT || 3030);
