require('dotenv').config();
const express = require("express");
const path = require('path');  // <-- ADD THIS LINE
// const authRoutes = require('./routes/auth-routes');
// const homeRoutes = require('./routes/home-routes');
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
const peerServer = ExpressPeerServer(server,{
    debug : true
});


app.set('view engine','ejs');
app.use(express.static('public'));
app.use('/peerjs',peerServer);

app.use(cookieSession({
    maxAge : 24*60*60*1000,
    keys : [keys.session.cookieKey]
}))

app.use(passport.initialize());
app.use(passport.session());

//connect to mongodb
mongoose.connect(keys.mongodb.dbURI,() => {
    console.log('connected to mongodb');
})


app.get('/',(req,res) => {
    res.redirect('/login');
})

app.get('/login',  (req, res) => {
    res.render('login');
})


app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile'],
    prompt:'select_account'
}));

app.get('/logout', (req,res) => {
    req.logout();
    req.session = null;
    res.redirect('/');
});

app.get('/auth/google/redirect', passport.authenticate('google'), (req, res) => {
    // Redirect back to the room they originally tried to join, or /home if no saved URL
    const redirectTo = req.session && req.session.returnTo ? req.session.returnTo : '/home';
    if (req.session) {
        delete req.session.returnTo;
    }
    res.redirect(redirectTo);
});

// FIXED: authCheck now saves the room URL before redirecting to login
const authCheck = (req, res, next) => {
    // Ignore static assets (files with extensions like .ico, .css, .js)
    const ext = path.extname(req.path);
    if (ext) {
        return next();
    }

    if (!req.user) {
        // Save where they were trying to go so we can redirect them back after auth
        req.session.returnTo = req.originalUrl || '/';
        return res.redirect('/auth/google');
    }
    next();
};

app.get('/home',authCheck,(req, res) => {
    res.render('home',{user : req.user});
});

// Remove global ROOM. Each call to /room now generates a fresh UUID.
app.get('/room', (req, res) => {
    const freshRoomId = uuidV4(); // unique meeting ID for this request
    res.redirect(`/${freshRoomId}`);
});

// Optional endpoint to just return a fresh meeting link as JSON.
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

// Optional endpoint to just return a fresh meeting link as JSON.
// This is handy for a "Copy link" button without doing a redirect.


// (The commented board routes are kept for possible future expansion.)
// app.get('/room/board', (req, res) => {
//     res.redirect(`/${ROOM}/board`);
// });
// app.get('/:room/board', (req, res) => {
//     res.render('board');
// });

let connectboard = [];

io.on('connection',socket => {
    socket.on('join-room',(roomId,userId) => {
        socket.join(roomId);
        socket.broadcast.to(roomId).emit('user-connected',userId);
        socket.on('message',message => {
            io.to(roomId).emit('createMessage',message);
        })
        connectboard.push(socket);
        console.log(`${socket.id} has connected`);

        socket.on('draw', (data) => {
    // Broadcast drawing only to other participants in the same room
    socket.broadcast.to(roomId).emit('ondraw', data);
});

        socket.on('down', (data) => {
    // Broadcast mouse‑down events only within the same room
    socket.broadcast.to(roomId).emit('ondown', data);
});

        socket.on('endcall', () => {
    console.log('endcall received from socket.id:', socket.id);
    socket.to(roomId).emit('user-disconnected', userId);
});

        socket.on('disconnect',(reason) => {
            console.log(`${socket.id} is disconnected`)
            socket.to(roomId).emit('user-disconnected', userId);
            connectboard = connectboard.filter((con) => con.id !== socket.id);
        })
    })
})

server.listen(process.env.PORT || 3030);