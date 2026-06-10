require('dotenv').config();
const express = require("express");
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const passportSetup = require('./config/passport-setup');
const mongoose = require('mongoose');
const keys = require('./config/keys');
const cookieSession = require('cookie-session');
const passport = require('passport');
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const {v4:uuidV4} = require('uuid');
const {ExpressPeerServer} = require('peer');

const peerServer = ExpressPeerServer(server, {
    debug: true
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}.webm`);
    }
});

const upload = multer({ storage });

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
    res.redirect(`/${freshRoomId}`);
});

app.get('/new', (req, res) => {
    const freshRoomId = uuidV4();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/${freshRoomId}`;
    res.json({ link });
});

app.get('/:room', authCheck, (req, res) => {
    const userName = req.user && req.user.username ? req.user.username : 'Anonymous';
    res.render('room', { roomId: req.params.room, user: userName });
});

app.post('/transcribe', (req, res, next) => {
    const roomId = req.query.roomId || 'unknown-room';
    const userName = req.query.userName || 'anonymous';

    upload.single('audio')(req, res, (err) => {
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
