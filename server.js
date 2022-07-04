const express = require("express");
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
const {v4:uuidv4} = require('uuid');
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
}));

app.get('/logout', (req,res) => {
    req.logout();
    req.session = null;
    res.redirect('/');
});

app.get('/auth/google/redirect', passport.authenticate('google'), (req, res) => {
    username = req.user.username
    res.redirect('/home');
    
});

const authCheck = (req, res, next) => {
    if(!req.user){
        res.redirect('/login');
    } else {
        next();
    }
};

app.get('/home',authCheck,(req, res) => {
    res.render('home.ejs',{user : req.user});
});

app.get('/room',(req,res) => {
    res.redirect(`/${uuidv4()}`);
})

app.get('/:room',(req,res) => {
    res.render('room',{roomId : req.params.room});
})

io.on('connection',socket => {
    socket.on('join-room',(roomId,userId) => {
        socket.join(roomId);
        socket.broadcast.to(roomId).emit('user-connected',userId);
        socket.on('message',message => {
            io.to(roomId).emit('createMessage',message);
        })
    })
})

server.listen(process.env.PORT || 3030);