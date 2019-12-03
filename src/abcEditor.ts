import * as vscode from 'vscode';
import { Disposable } from './dispose';

interface Edit {
    value: string;
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
        private readonly uri: vscode.Uri,
        private readonly panel: vscode.WebviewPanel
    ) {
        super();

        panel.webview.options = {
            enableScripts: true,
        };

        this.setInitialContent(panel);

        let resolve: () => void;
        this.ready = new Promise<void>(r => resolve = r);

        panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'edit':
                    const edit: Edit = { value: message.value };
                    this._edits.push(edit);
                    this._onEdit.fire(edit);
                    break;

                case 'ready':
                    resolve();
                    break;
            }
        });

        panel.onDidDispose(() => { this.dispose(); })

        this.editingCapability = this;
    }

    private async setInitialContent(panel: vscode.WebviewPanel): Promise<void> {
        const initialContent = await vscode.workspace.fs.readFile(this.uri);
        this.initialValue = Buffer.from(initialContent).toString('utf8')

        panel.webview.html = this.getHtml(this.initialValue);
    }

    private getHtml(value: string) {
        return /* html */`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="ie=edge">
            <title>Document</title>
        </head>
        <body>
            <textarea style="width: 300px; height: 300px;"></textarea>
            <script>
                const vscode = acquireVsCodeApi();

                const textArea = document.querySelector('textarea');
                textArea.value = ${JSON.stringify(value)};

                window.addEventListener('message', e => {
                    switch (e.data.type) {
                        case 'apply':
                            textArea.value = e.data.value;
                            break;
                    }
                })

                textArea.addEventListener('input', e => {
                    console.log('change', e);
                    vscode.postMessage({
                        type: 'edit',
                        value: textArea.value
                    })
                });

                vscode.postMessage({ type: 'ready' })
            </script>
        </body>
        </html>`;
    }

    save(): Thenable<void> {
        return vscode.workspace.fs.writeFile(this.uri, Buffer.from(this.getContents()))
    }

    saveAs(resource: vscode.Uri, targetResource: vscode.Uri): Thenable<void> {
        console.log('saveAs')
        return vscode.workspace.fs.writeFile(targetResource, Buffer.from(this.getContents()));
    }

    hotExit(hotExitPath: vscode.Uri): Thenable<void> {
        throw new Error("Method not implemented.");
    }

    async applyEdits(edits: readonly any[]): Promise<void> {
        this._edits.push(...edits.map(x => typeof x === 'string' ? JSON.parse(x) : x));
        this.update();
    }

    async undoEdits(edits: readonly any[]): Promise<void> {
        this._edits.pop();
        this.update();
    }

    private async update() {
        await this.ready;
        this.panel.webview.postMessage({
            type: 'apply',
            value: this.getContents()
        });
    }

    private getContents() {
        return this._edits.length ? this._edits[this._edits.length - 1].value : this.initialValue;
    }
}
