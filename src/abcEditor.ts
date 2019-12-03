import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './dispose';

interface Edit {
    readonly value: string;
}

export class AbcEditor extends Disposable implements vscode.WebviewEditorCapabilities, vscode.WebviewEditorEditingCapability {

    public static readonly viewType = 'testWebviewEditor.abc';

    public readonly editingCapability?: vscode.WebviewEditorEditingCapability;

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    private readonly _edits: Edit[] = [];
    private initialValue: string;
    private readonly ready: Promise<void>;

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
                case 'edit':
                    const edit: Edit = { value: message.value };
                    this._edits.push(edit);
                    this._onEdit.fire(edit);
                    break;
            }
        });

        panel.onDidDispose(() => { this.dispose(); })

        this.editingCapability = this;

        this.setInitialContent(panel);
    }

    private async setInitialContent(panel: vscode.WebviewPanel): Promise<void> {
        const initialContent = await vscode.workspace.fs.readFile(this.uri);
        this.initialValue = Buffer.from(initialContent).toString('utf8')
        this.update();
    }

    private get html() {
        const contentRoot = path.join(this._extensionPath, 'content');
        const scriptUri = vscode.Uri.file(path.join(contentRoot, 'abc.js'));
        const nonce = Date.now() + '';
        return /* html */`<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
                <title>Document</title>
            </head>
            <body>
                <textarea style="width: 300px; height: 300px;"></textarea>
                <script nonce=${nonce} src="${this.panel.webview.asWebviewUri(scriptUri)}"></script>
            </body>
            </html>`;
    }

    async save(): Promise<void> {
        return vscode.workspace.fs.writeFile(this.uri, Buffer.from(this.getContents()))
    }

    async saveAs(_resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        return vscode.workspace.fs.writeFile(targetResource, Buffer.from(this.getContents()));
    }

    async applyEdits(edits: readonly any[]): Promise<void> {
        this._edits.push(...edits);
        this.update();
    }

    async undoEdits(edits: readonly any[]): Promise<void> {
        for (let i = 0; i < edits.length; ++i) {
            this._edits.pop();
        }
        this.update();
    }

    private async update() {
        if (this.isDisposed) {
            return;
        }

        this.panel.webview.postMessage({
            type: 'setValue',
            value: this.getContents()
        });
    }

    private getContents() {
        return this._edits.length ? this._edits[this._edits.length - 1].value : this.initialValue;
    }
}
