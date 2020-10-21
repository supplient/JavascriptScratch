const FONT_SIZE = 100;
const KERNEL_R = 1;

var gradCanvas, gradCTX;
var debugCanvas, debugCTX;

window.onload = function main() {
    // This function is called when html page is loaded
    var strokeCanvas = document.getElementById( "strokeCanvas" );
    var strokeCTX = strokeCanvas.getContext("2d");
    var lineCanvas = document.getElementById("lineCanvas");
    var lineCTX = lineCanvas.getContext("2d");

    gradCanvas = document.getElementById("gradCanvas");
    gradCTX = gradCanvas.getContext("2d");
    debugCanvas = document.getElementById("debugCanvas");
    debugCTX = debugCanvas.getContext("2d");

    var inputer = document.getElementById("textInput");
    inputer.addEventListener("input", (event) => {
        UpdateTextImage(strokeCanvas, strokeCTX, event.target.value, FONT_SIZE);

        var strokeImgData = strokeCTX.getImageData(0, 0, strokeCanvas.clientWidth, strokeCanvas.clientHeight);
        ProcessImg(strokeImgData.data, strokeCanvas.clientWidth, strokeCanvas.clientHeight);
        createImageBitmap(strokeImgData).then((imgBitmap) => {
            DrawImageData(lineCanvas, lineCTX, imgBitmap);
        })
    });

};

function UpdateTextImage(canvas, ctx, s, font_size) {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.font = font_size + "px serif";
    ctx.fillText(s, 0, font_size);
}

function DrawImageData(canvas, ctx, imageData) {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.drawImage(imageData, 0, 0);
}

function ProcessImg(data, width, height) {
    // Support Functions
    var CalIndex = (x, y) => {
        var index = y*width + x;
        index -= 1;
        index *= 4;
        return index;
    };
    var At = (x, y) => {
        var index = CalIndex(x, y);
        return [data[index], data[index+1], data[index+2], data[index+3]];
    };
    var ColorIsBlank = (color) => {
        return !(color[0] || color[1] || color[2] || color[3]);
    };
    var ColorIsFill = (color) => {
        return color[3]>125;
    }
    var SetColor = (x, y, color) => {
        var index = CalIndex(x, y);
        for(var i=0; i<4; i++)
            data[index+i] = color[i];
    }

    var IsBlank = (x, y) => {
        return ColorIsBlank(At(x, y));
    };
    var IsFill = (x, y) => {
        return ColorIsFill(At(x, y));
    }
    var SetBlank = (x, y) => {
        SetColor(x, y, [0,0,0,0]);
    };
    var ToBool = (x, y) => {
        if(IsFill(x, y))
            return 1;
        else
            return 0;
    };
    var SetBool = (x, y, value) => {
        if(value)
            SetColor(x, y, [0,0,0,255]);
        else
            SetColor(x, y, [0,0,0,0]);
    };

    // Init gradients
    var gradTab = new Array(width);
    for(var x=0; x<width; x++) {
        gradTab[x] = new Array(height);
        for(var y=0; y<height; y++)
            gradTab[x][y] = [0, 0];
    }

    // Calculate gradients by sobel operator
    var Gx = [
        [-0, -1, 0, 1, 0],
        [-1, -2, 0, 2, 1],
        [-2, -3, 0, 3, 2],
        [-1, -3, 0, 2, 1],
        [-0, -1, 0, 1, 0]
    ];
    var Gy = [
        [0, 1, 2, 1, 0],
        [1, 2, 3, 2, 1],
        [0, 0, 0, 0, 0],
        [-1, -2, -3, -2, -1],
        [-0, -1, -2, -1, -0],
    ];
    for(var x=0; x<width; x++)
    for(var y=0; y<height; y++) {
        if(!IsFill(x, y))
            continue;

        var gx=0, gy=0;
        for(var sx=0; sx<5; sx++) {
            if(x+sx >= width)
                break;
            for(var sy=0; sy<5; sy++) {
                if(y+sy >= height)
                    break;
                if(!IsFill(x+sx, y+sy))
                    continue;
                gx += Gx[sx][sy];
                gy += Gy[sx][sy];
            }
        }

        gradTab[x][y] = [gx, gy];
        // SetColor(x, y, [gx,gy,0, 255]);
    }

    DrawGrad(gradTab, width, height);

    // Init strokeMap
    var strokeMap = new Array(width);
    for(var x=0; x<width; x++) {
        strokeMap[x] = new Array(height);
        for(var y=0; y<height; y++)
            strokeMap[x][y] = 0;
    }
    var strokeGroupIDCount = 2; // left 0 for no group id, 1 for determining

    // Support Functions
    var CalGradDiff = (grad0, grad1) => {
        var dx = Math.abs(grad0[0]-grad1[0]);
        var dy = Math.abs(grad0[1]-grad1[1]);
        return dx+dy;
    };
    var CheckGradDiff = (gradDiff) => {
        return gradDiff < 6;
    };

    // Split strokes
    for(var x=0; x<width; x++)
    for(var y=0; y<height; y++) {
        if(!IsFill(x, y) || strokeMap[x][y]!=0)
            continue;
        
        var groupID = strokeGroupIDCount;
        strokeGroupIDCount++;

        var stack = new Array();
        stack.push([x, y]);
        strokeMap[x][y] = 1;
        while(stack.length > 0) {
            var pos = stack.pop();
            var px = pos[0];
            var py = pos[1];
            strokeMap[px][py] = groupID;

            var neighbors = [
                [px-1, py],
                [px+1, py],
                [px, py-1],
                [px, py+1]
            ];
            for(var i=0; i<neighbors.length; i++) {
                var neighbor = neighbors[i];
                var nx = neighbor[0];
                var ny = neighbor[1];
                if(nx<0 || nx>=width || ny<0 || ny>=height)
                    continue;
                if(strokeMap[nx][ny] >= 1)
                    continue;
                if(!IsFill(nx, ny))
                    continue;

                var gradDiff = CalGradDiff(gradTab[px][py], gradTab[nx][ny]);
                if(CheckGradDiff(gradDiff)) {
                    strokeMap[nx][ny] = 1;
                    stack.push([nx, ny]);
                }
            }
        }
    }

    DrawDebug(strokeMap, width, height);
}

function DrawGrad(data, width, height) {
    var pixelWidth = gradCanvas.clientWidth;
    var pixelHeight = gradCanvas.clientHeight;
    gradCTX.clearRect(0, 0, pixelWidth, pixelHeight);

    var perWidth = pixelWidth / width;
    var perHeight = pixelHeight / height;
    gradCTX.font = perHeight + "px serif";

    for(var x=0; x<width; x++)
    for(var y=0; y<height; y++) {
        if(data[x][y][0]==0 && data[x][y][1]==0)
            continue;
        gradCTX.fillText("(" + data[x][y] + ")", x*perWidth, y*perHeight, perWidth);
    }
}

function DrawDebug(data, width, height) {
    var pixelWidth = debugCanvas.clientWidth;
    var pixelHeight = debugCanvas.clientHeight;
    debugCTX.clearRect(0, 0, pixelWidth, pixelHeight);

    var perWidth = pixelWidth / width;
    var perHeight = pixelHeight / height;
    debugCTX.font = perHeight + "px serif";

    for(var x=0; x<width; x++)
    for(var y=0; y<height; y++) {
        if(data[x][y]==0)
            continue;
        debugCTX.fillText("(" + data[x][y] + ")", x*perWidth, y*perHeight, perWidth);
    }
}