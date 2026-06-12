const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myVideo = document.createElement('video');
myVideo.muted = true;


let myVideoStream
let count = 1;
let mediaRecorder;
let audioChunks = [];
let isEndingMeeting = false;
const peers = {};
let recordingStoppedPromiseResolve;
let recordingStoppedPromise = new Promise((resolve) => {
    recordingStoppedPromiseResolve = resolve;
});

navigator.mediaDevices.getUserMedia({
    video : true,
    audio : true
}).then (stream => {
    myVideoStream = stream;
    addVideoStream(myVideo,stream);

    // 🎯 AUDIO GAIN FIX START
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 2.0; // try 1.5 → 2.5

    const destination = audioContext.createMediaStreamDestination();

    source.connect(gainNode);
    gainNode.connect(destination);

    const processedStream = destination.stream;
    // 🎯 AUDIO GAIN FIX END

    mediaRecorder = new MediaRecorder(processedStream, {
        mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {

        try {

            const audioBlob = new Blob(audioChunks, {
                type: 'audio/webm'
            });

            const formData = new FormData();
            formData.append('audio', audioBlob, 'meeting.webm');

            const response = await fetch(
                `/transcribe?roomId=${encodeURIComponent(ROOM_ID)}&userName=${encodeURIComponent(USER_NAME)}`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            const result = await response.json();
            console.log(result);

            audioChunks = [];

            // 👇 ONLY redirect if normal leave (not host end flow)
            if (!isEndingMeeting) {
                window.location = '/home';
            }

            recordingStoppedPromiseResolve();

        } catch (err) {
            console.error(err);
        }
    };

    mediaRecorder.start();

    console.log('Recording started');

    peer = new Peer(undefined, {
        host: window.location.hostname,
        port: window.location.port ? Number(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80),
        path: '/peerjs',
        secure: window.location.protocol === 'https:',
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: "stun:stun.relay.metered.ca:80",
                },
                {
                    urls: "turn:free.expressturn.com:3478",
                    username: "000000002096479454",
                    credential: "q8owKcd1mFzx9dXifGjiBED2Xo0="
                },
                // {
                //     urls: "turn:global.relay.metered.ca:80",
                //     username: "61a48bde959b8b9a05ffa29a",
                //     credential: "Fp5Rx4AS346A0Ydh",
                // },
                // {
                //     urls: "turn:global.relay.metered.ca:80?transport=tcp",
                //     username: "61a48bde959b8b9a05ffa29a",
                //     credential: "Fp5Rx4AS346A0Ydh",
                // },
                // {
                //     urls: "turn:global.relay.metered.ca:443",
                //     username: "61a48bde959b8b9a05ffa29a",
                //     credential: "Fp5Rx4AS346A0Ydh",
                // },
                // {
                //     urls: "turns:global.relay.metered.ca:443?transport=tcp",
                //     username: "61a48bde959b8b9a05ffa29a",
                //     credential: "Fp5Rx4AS346A0Ydh",
                // },
            ]
        }
    });

    peer.on('call', call => {
        console.log('Incoming call from', call.peer);

        call.on('error', err => {
            console.log('CALL ERROR', err);
        });

          call.answer(stream);
          const video = document.createElement('video');
          // Set the ID so user-disconnected can find and remove this element
          video.setAttribute('id', call.peer);
          call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream);
          });
          call.on('close', () => {
            video.remove();
          });
          peers[call.peer] = call;
    })

    socket.on('user-connected',(userId) => {
        count++;
        console.log('USER CONNECTED EVENT', userId);
        console.log(count);
        connecToNewUser(userId,stream);
    })

    peer.on('open',id =>{
        console.log('PEER OPEN', id);
        socket.emit('join-room',ROOM_ID,id);
    })

    peer.on('error', err => {
        console.log('PEER ERROR', err);
    });
})

const leaveMeeting = () => {

    isEndingMeeting = false;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    for (const id in peers) {
        if (peers[id]) peers[id].close();
    }

    socket.disconnect();
    window.location = '/home';
};

const endMeeting = async () => {

    isEndingMeeting = true;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    await recordingStoppedPromise;

    // fallback safety (if already stopped)
    await fetch('/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: ROOM_ID })
    });

    socket.emit('endcall');

    for (const id in peers) {
        if (peers[id]) peers[id].close();
    }

    window.location = `/meeting-summary/${ROOM_ID}`;
};


const connecToNewUser = (userId,stream) => {
    const call = peer.call(userId,stream);
    call.on('error', err => {
        console.log('CALL ERROR', err);
    });
    const video = document.createElement('video');
    video.setAttribute('id',userId);
    call.on('stream',userVideoStream => {
        addVideoStream(video,userVideoStream,userId);
    })

    call.on('close', () => {
        video.remove();
    })

    peers[userId] = call;

    // resizeVideoWrappers();

}

const addVideoStream = (video,stream) => {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata',() => {
        video.play();
    })

    videoGrid.append(video);
}

let chatInput = $('#chat_message');

$('html').keydown((e) => {
    if (e.which === 13 && chatInput.val().trim().length !== 0) {
        // Emit both username and text
        socket.emit('message', { user: USER_NAME, text: chatInput.val().trim() });
        chatInput.val('');
    }
});

socket.on('createMessage',data => {
    const displayName = data.user || 'Anonymous';
    const text = data.text || '';
    $('ul').append(`<li class="message"><b>${displayName}</b><br/>${text}</li>`);
});

socket.on('user-disconnected', userId => {
    console.log('user-disconnected event received for userId:', userId);
    count--;
    var userVideo = document.getElementById(userId);
    if(userVideo) {
        userVideo.remove();
    }
    if(peers[userId]) {
        peers[userId].close();
    }
})

const scrollToBottom = () => {
    let d = $('.main_chat_window');
    d.scrollTop(d.prop('scrollHeight'));
}

let canvas =  document.getElementById('canvas');

const whiteboard = document.querySelector('.whiteboard');

canvas.width = whiteboard.clientWidth;
canvas.height = whiteboard.clientHeight;

let ctx = canvas.getContext('2d');

// let x;
// let y;

let mouseDown = false;
let isErasing = false;
let eraserSize = 20;

$('#eraser-size').on('input', function() {
    eraserSize = this.value;
    if(isErasing) {
        const cursor = document.getElementById('eraser-cursor');
        cursor.style.width = eraserSize + 'px';
        cursor.style.height = eraserSize + 'px';
    }
});

window.onmousedown = (e) => {
    ctx.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
    ctx.lineWidth = isErasing ? eraserSize : 2;
    ctx.beginPath();
    ctx.moveTo(x,y);
    socket.emit('down',{x,y,isErasing,eraserSize});
    mouseDown = true;
}

window.onmouseup = (e) => {
    mouseDown = false;
}

socket.on('ondraw',({x,y,isErasing,eraserSize}) => {
    ctx.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
    ctx.lineWidth = isErasing ? eraserSize : 2;
    ctx.lineTo(x,y);
    ctx.stroke();
})

socket.on('ondown',({x,y,isErasing,eraserSize}) => {
    ctx.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
    ctx.lineWidth = isErasing ? eraserSize : 2;
    ctx.moveTo(x,y);
})

window.onmousemove =  (e) => {
    x = e.clientX;
    y = e.clientY;

    if(isErasing) {
        const cursor = document.getElementById('eraser-cursor');
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';
    }

    if(mouseDown){
        ctx.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
        ctx.lineWidth = isErasing ? eraserSize : 2;
        socket.emit('draw',{x,y,isErasing,eraserSize});
        ctx.lineTo(x,y);
        ctx.stroke();
    }
    
}



/*toggled active class*/
const left = $('.main_left');
const right = $('.main_right');
$('.fa-message').click(function(){
    left.toggleClass('active');
    right.toggleClass('active');
});

const toggleWhiteboard = () => {
    $('.whiteboard').toggleClass("bring-in");

}

const toggleEraser = () => {
    isErasing = !isErasing;
    $('.eraser_button').toggleClass('active-eraser');
    
    if (isErasing) {
        $('#eraser-controls').show();
        $('.whiteboard').addClass('erasing');
        const cursor = document.getElementById('eraser-cursor');
        cursor.style.display = 'block';
        cursor.style.width = eraserSize + 'px';
        cursor.style.height = eraserSize + 'px';
    } else {
        $('#eraser-controls').hide();
        $('.whiteboard').removeClass('erasing');
        document.getElementById('eraser-cursor').style.display = 'none';
    }
}

const muteUnmute = () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if(enabled){
        myVideoStream.getAudioTracks()[0].enabled = false;
        setUnmuteButton();
    }
    else{
        myVideoStream.getAudioTracks()[0].enabled = true;
        setMuteButton();
    }
}

const setMuteButton = () => {
    const html = `<i class="fa-solid fa-microphone"></i>`;

    document.querySelector('.main_mute_button').innerHTML = html;
}

const setUnmuteButton = () => {
    const html = `<i class="fa-solid fa-microphone-slash"></i>`;

    document.querySelector('.main_mute_button').innerHTML = html;
}

const playStop = () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    if(enabled){
        myVideoStream.getVideoTracks()[0].enabled = false;
        setStopVideo();
    }
    else{
        myVideoStream.getVideoTracks()[0].enabled = true;
        setPlayVideo();
    }
}

const setPlayVideo = () => {
    const html = ` <i class="fa-solid fa-video"></i>`;

    document.querySelector('.main_video_button').innerHTML = html;
}

const setStopVideo = () => {
    const html = ` <i class="fa-solid fa-video-slash"></i>`;

    document.querySelector('.main_video_button').innerHTML = html;
}

window.addEventListener('load', () => {

    if (typeof IS_HOST !== 'undefined' && IS_HOST) {
        const btn = document.getElementById('end-meeting-btn');
        if (btn) {
            btn.style.display = 'block';
        }
    }
});

