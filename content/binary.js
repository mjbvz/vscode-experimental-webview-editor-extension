// @ts-check
const vscode = acquireVsCodeApi();

const cursor = document.createElement('div');
cursor.classList.add('cursor');
document.body.append(cursor);

class Stroke {
    constructor(/** @type {Array<[number, number]> | undefined} */ points) {
        /** @type {Array<[number, number]>} */
        this.points = points || [];
    }

    /**
     * @param {number} x 
     * @param {number} y 
     */
    add(x, y) {
        this.points.push([x, y])
    }
}

class Model {
    constructor() {
        /** @type {Array<Stroke>} */
        this.strokes = [];

        /** @type {Stroke | undefined} */
        this.currentStroke = undefined;

        /** @type {Array<() => void>} */
        this.listeners = [];
    }

    listen(/** @type {() => void} */ listener) {
        this.listeners.push(listener);
    }

    begin() {
        this.currentStroke = new Stroke();
        this.strokes.push(this.currentStroke);
    }

    end() {
        const previous = this.currentStroke;
        this.currentStroke = undefined;
        return previous;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     */
    add(x, y) {
        if (!this.currentStroke) {
            return;
        }
        this.currentStroke.add(x, y)
    }

    undo() {
        if (!this.strokes.length) {
            return;
        }
        this.strokes.pop();
        this.listeners.forEach(x => x());
    }

    redo(points) {
        this.strokes.push(new Stroke(points));
        this.listeners.forEach(x => x());
    }
}

class View {
    constructor(
        /** @type {HTMLElement} */ parent,
        /** @type {Model} */ model,
    ) {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'image-wrapper';
        this.wrapper.style.position = 'relative';
        parent.append(this.wrapper);

        this.initialCanvas = document.createElement('canvas');
        this.initialCanvas.className = 'initial-canvas';
        this.initialCtx = this.initialCanvas.getContext('2d');
        this.wrapper.append(this.initialCanvas);

        this.drawingCanvas = document.createElement('canvas');
        this.drawingCanvas.className = 'drawing-canvas';
        this.drawingCanvas.style.position = 'absolute';
        this.drawingCanvas.style.top = '0';
        this.drawingCanvas.style.left = '0';
        this.drawingCtx = this.drawingCanvas.getContext('2d');
        this.wrapper.append(this.drawingCanvas);

        let isDrawing = false

        document.body.addEventListener('mousedown', () => {
            model.begin();
            isDrawing = true;
            document.body.classList.add('drawing');
            this.drawingCtx.beginPath();
        });

        document.body.addEventListener('mouseup', async () => {
            isDrawing = false;
            document.body.classList.remove('drawing');
            this.drawingCtx.closePath();

            const stroke = model.end();

            const data = await this.getData();
            vscode.postMessage({ type: 'stroke', value: { points: stroke.points, data } });
        });

        document.body.addEventListener('mousemove', e => {
            if (!isDrawing) {
                return;
            }

            const rect = this.wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.drawingCtx.lineTo(x, y);
            this.drawingCtx.stroke();
            model.add(x, y);

            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        });

        model.listen(() => {
            this.redraw(model);
        });
    }

    redraw(model) {
        this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
        for (const stroke of model.strokes) {
            this.drawingCtx.beginPath();
            for (const [x, y] of stroke.points) {
                this.drawingCtx.lineTo(x, y);
            }
            this.drawingCtx.stroke();
            this.drawingCtx.closePath();
        }
    }

    async drawBackgroundImage(/** @type{Blob} */ blob) {
        const img = await createImageBitmap(blob);
        this.initialCanvas.width = this.drawingCanvas.width = img.width;
        this.initialCanvas.height = this.drawingCanvas.height = img.height;
        this.initialCtx.drawImage(img, 0, 0);
    }

    /** @return {Promise<Uint8Array>} */
    async getData() {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = this.drawingCanvas.width;
        outCanvas.height = this.drawingCanvas.height;

        const outCtx = outCanvas.getContext('2d');
        outCtx.drawImage(this.initialCanvas, 0, 0);
        outCtx.drawImage(this.drawingCanvas, 0, 0);

        const blob = await new Promise(resolve => {
            outCanvas.toBlob(resolve, 'image/jpeg')
        });

        return new Uint8Array(await blob.arrayBuffer());
    }
}

const model = new Model();

const view = new View(document.body, model);

window.addEventListener('message', async e => {
    switch (e.data.type) {
        case 'init':
            const buffer = new Uint8Array(e.data.value.data);
            const blob = new Blob([buffer], { type: 'image/jpeg' });
            view.drawBackgroundImage(blob);
            view.redraw(model);
            break;

        case 'save':
            vscode.postMessage({ type: 'save' })
            break;

        case 'undo':
            model.undo()
            break;

        case 'redo':
            model.redo(e.data.value);
            break;
    }
});



vscode.postMessage({ type: 'ready' })

