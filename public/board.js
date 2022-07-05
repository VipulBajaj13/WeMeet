// let canvas =  document.getElementById('canvas');

// canvas.height = window.innerHeight;
// canvas.width = window.innerWidth;

// var io = io('/')

// let ctx = canvas.getContext('2d');

// // ctx.beginPath();
// // ctx.moveTo(0,0);
// // ctx.lineTo(150,150);
// // ctx.stroke();

// let x;
// let y;

// let mouseDown = false;

// window.onmousedown = (e) => {
//     ctx.beginPath();
//     ctx.moveTo(x,y);
//     io.emit('down',{x,y});
//     mouseDown = true;
// }

// window.onmouseup = (e) => {
//     mouseDown = false;
// }

// io.on('ondraw',({x,y}) => {
//     ctx.lineTo(x,y);
//     ctx.stroke();
// })

// io.on('ondown',({x,y}) => {
//     ctx.moveTo(x,y);
// })

// window.onmousemove =  (e) => {
//     x = e.clientX;
//     y = e.clientY;

//     if(mouseDown){
//         io.emit('draw',{x,y});
//         ctx.lineTo(x,y);
//         ctx.stroke();
//     }
    
// }