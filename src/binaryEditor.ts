import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable } from './dispose';

interface Edit {
    readonly points: [number, number][];
    readonly data: Uint8Array;
}

export class CatEditor extends Disposable implements vscode.WebviewEditorCapabilities, vscode.WebviewEditorEditingCapability {

    public static readonly viewType = 'testWebviewEditor.catDraw';

    public readonly editingCapability?: vscode.WebviewEditorEditingCapability;

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    private readonly _edits: Edit[] = [];
    private initialValue: Uint8Array;

    constructor(
        private readonly _extensionPath: string,
        private readonly uri: vscode.Uri,
        private readonly panel: vscode.WebviewPanel
    ) {
        super();

        panel.webview.options = {
            enableScripts: true,
        };
        panel.webview.html = this.html;

        panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'stroke':
                    const edit: Edit = { points: message.value.points, data: new Uint8Array(message.value.data.data) };
                    this._edits.push(edit);
                    this._onEdit.fire(edit);
                    break;
            }
        });

        this.editingCapability = this;

        this.setInitialContent();
    }

    private async setInitialContent(): Promise<void> {
        this.initialValue = await vscode.workspace.fs.readFile(this.uri);
        this.postMessage('init', this.initialValue);
    }

    private get html() {
        const contentRoot = path.join(this._extensionPath, 'content');
        return /* html */`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="ie=edge">
            <title>Document</title>

            <style>
                .cursor {
                    width: 20px;
                    height: 30px;
                    position: absolute;
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

    async saveAs(_resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        if (this._edits.length) {
            return vscode.workspace.fs.writeFile(targetResource, this.initialValue);
        }

        const edit = this._edits[this._edits.length - 1];
        return vscode.workspace.fs.writeFile(targetResource, edit.data);
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
        if (this.isDisposed) {
            return;
        }
        this.panel.webview.postMessage({ type, value });
    }
}
