import * as vscode from 'vscode';
import * as path from 'path';

interface Edit {
    points: [number, number][];
    data: Uint8Array;
}

export class CatEditor implements vscode.WebviewEditorCapabilities, vscode.WebviewEditorEditingCapability {

    public static readonly viewType = 'testWebviewEditor.catDraw';

    public readonly editingCapability?: vscode.WebviewEditorEditingCapability;

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    private readonly _edits: Edit[] = [];
    private initialValue: Uint8Array;
    private readonly ready: Promise<void>;

    constructor(
        private readonly _extensionPath: string,
        private readonly uri: vscode.Uri,
        private readonly panel: vscode.WebviewPanel
    ) {
        panel.webview.options = {
            enableScripts: true,
        };

        this.setInitialContent(panel);

        let resolve: () => void;
        this.ready = new Promise<void>(r => resolve = r);

        panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'stroke':
                    const edit: Edit = { points: message.value.points, data: new Uint8Array(message.value.data.data) };
                    this._edits.push(edit);
                    this._onEdit.fire(edit);
                    break;

                case 'ready':
                    resolve();
                    break;
            }
        });

        this.editingCapability = this;
    }

    private async setInitialContent(panel: vscode.WebviewPanel): Promise<void> {
        panel.webview.html = this.getHtml(this.uri);
        this.initialValue = await vscode.workspace.fs.readFile(this.uri);
        this.postMessage('init', this.initialValue);
    }

    private getHtml(resource: vscode.Uri) {
        const contentRoot = path.join(this._extensionPath, 'content');
        const resourcePath = JSON.stringify(this.panel.webview.asWebviewUri(resource).toString());
        const cursor = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(contentRoot, 'paw.svg')));
        return /* html */`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="ie=edge">
            <title>Document</title>

            <meta id="resourcePath" data-value=${resourcePath}>

            <style>
                .cursor {
                    width: 20px;
                    height: 30px;
                    position: absolute;
                    background-image: url(${cursor});
                    background-position: stretch;
                    display: none;
                    z-index: 10;
                    background-repeat: no-repeat;
                }

                .drawing {
                    cursor: none;
                }

                .drawing .cursor {
                    display: block;
                }
            </style>
        </head>
        <body>
            <script src="${this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(contentRoot, 'binary.js')))}"></script>
        </body>
        </html>`;
    }

    async save(): Promise<void> {
        if (!this._edits.length) {
            return;
        }
        const edit = this._edits[this._edits.length - 1];
        return vscode.workspace.fs.writeFile(this.uri, edit.data);
    }

    async saveAs(resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        console.log('saveAs')
        // return vscode.workspace.fs.writeFile(targetResource, Buffer.from(this.getContents()));
    }

    hotExit(hotExitPath: vscode.Uri): Thenable<void> {
        throw new Error("Method not implemented.");
    }

    async applyEdits(edits: readonly Edit[]): Promise<void> {
        this._edits.push(...edits);
        for (const edit of edits) {
            this.postMessage('redo', edit.points);
        }
    }

    async undoEdits(edits: readonly Edit[]): Promise<void> {
        this._edits.pop();
        this.postMessage('undo', undefined);
    }

    private async postMessage(type: string, value: any) {
        await this.ready;
        this.panel.webview.postMessage({ type, value });
    }
}
