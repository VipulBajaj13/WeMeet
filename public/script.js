const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myVideo = document.createElement('video');
myVideo.muted = true;

var peer = new Peer();

let myVideoStream
let count = 1;
navigator.mediaDevices.getUserMedia({
    video : true,
    audio : true
}).then (stream => {
    myVideoStream = stream;
    addVideoStream(myVideo,stream);

    peer.on('call', call => {
          call.answer(stream);
          const video = document.createElement('video');
          call.on('stream',userVideoStream => {
            addVideoStream(video,userVideoStream);
        })
    })

    socket.on('user-connected',(userId) => {
        count++;
        console.log(count);
        connecToNewUser(userId,stream);
    })
})

peer.on('open',id =>{
    socket.emit('join-room',ROOM_ID,id);
})


const connecToNewUser = (userId,stream) => {
    const call = peer.call(userId,stream);
    const video = document.createElement('video');
    call.on('stream',userVideoStream => {
        addVideoStream(video,userVideoStream);
    })

    /*add next user to new row*/
    if(count%3 === 0){
        $('.video-grid').append(`<div class="break"></div>`);
    }

    // resizeVideoWrappers();

}

const addVideoStream = (video,stream) => {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata',() => {
        video.play();
    })

    videoGrid.append(video);
}

let text = $('input');

$('html').keydown((e) => {
    if(e.which == 13 && text.val().length !== 0){
        socket.emit('message',text.val());
        text.val('');
    }
})

socket.on('createMessage',message => {
    $('ul').append(`<li class="message"><b>User</b><br/>${message}</li>`);
})

const scrollToBottom = () => {
    let d = $('.main_chat_window');
    d.scrollTop(d.prop('scrollHeight'));
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

/*toggled active class*/
const left = $('.main_left');
const right = $('.main_right');
$('.fa-message').click(function(){
    left.toggleClass('active');
    right.toggleClass('active');
});


// function resizeVideoWrappers(){
//     var allVideos = $('.video');
//     var rows = Math.ceil(count/3);
//     var columns = Math.min(3,count);
//     var width = `${95/columns}%`;
//     var height = `${95/rows}%`;

//     allVideos.forEach(item => {
//         item.style.width = width;
//         item.style.height = height;
//     })
// }