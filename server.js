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
    res.render('home',{user : req.user});
});

var ROOM = uuidV4();
app.get('/room',(req,res) => {
    res.redirect(`/${ROOM}`);
})

app.get('/:room',(req,res) => {
    res.render('room',{roomId : req.params.room});
})

// app.get('/room/board',(req,res) => {
//     res.redirect(`/${ROOM}/board`);
// })

// app.get('/:room/board',(req,res) => {
//     res.render('board');
// })

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

        socket.on('draw',(data) => {
            connectboard.forEach(con => {
                if(con.id !== socket.id){
                    con.emit('ondraw',{x:data.x,y:data.y});
                }
            })
        })

        socket.on('down',(data) => {
            connectboard.forEach(con => {
                if(con.id !== socket.id){
                    con.emit('ondown',{x:data.x,y:data.y})
                }
            })
        })

        socket.on('endcall', () =>{
            socket.to(roomId).emit('user-disconnected', userId);
            
        })

        socket.on('disconnect',(reason) => {
            console.log(`${socket.id} is disconnected`)
            connectboard = connectboard.filter((con) => con.id !== socket.id);
        })
    })
})

server.listen(process.env.PORT || 3030);