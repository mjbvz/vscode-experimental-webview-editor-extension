import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './dispose';

interface Edit {
    readonly value: string;
}

export class AbcEditorManager {
    private readonly models = new Map<string, AbcModel>();

    register(
        extensionPath: string
    ): vscode.Disposable {
        return vscode.window.registerWebviewCustomEditorProvider(AbcEditor.viewType, {
            resolveWebviewEditor: async (input, panel) => {
                const model = this.models.get(input.resource.toString());
                if (!model) {
                    throw new Error('No model!');
                }
                new AbcEditor(extensionPath, input.resource, model, panel);
            },
            openWebviewEditorDocument: async (input) => {
                const existing = this.models.get(input.resource.toString());
                if (existing) {
                    return existing;
                }
                const newModel = await AbcModel.create(input.resource);
                this.models.set(input.resource.toString(), newModel);
                return newModel;
            }
        })
    }
}

export class AbcModel implements vscode.WebviewEditorCapabilities, vscode.WebviewEditorEditingCapability {
    private readonly value: string = '';
    private readonly _edits: Edit[] = [];

    private readonly _onUpdate = new vscode.EventEmitter<void>();
    public readonly onUpdate = this._onUpdate.event;

    public readonly editingCapability?: vscode.WebviewEditorEditingCapability;

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    public static async create(resource: vscode.Uri): Promise<AbcModel> {
        const buffer = await vscode.workspace.fs.readFile(resource);
        const initialValue = Buffer.from(buffer).toString('utf8')
        return new AbcModel(resource, initialValue);
    }

    private constructor(
        private readonly uri: vscode.Uri,
        private readonly initialValue: string
    ) {
        this.editingCapability = this;
    }

    async save(): Promise<void> {
        return vscode.workspace.fs.writeFile(this.uri, Buffer.from(this.value))
    }

    async saveAs(_resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        return vscode.workspace.fs.writeFile(targetResource, Buffer.from(this.value));
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

    public update() {
        this._onUpdate.fire();
    }

    public makeEdit(edit: Edit) {
        this._edits.push(edit);
        this._onEdit.fire(edit);
        this.update();
    } 

    public getContents() {
        return this._edits.length ? this._edits[this._edits.length - 1].value : this.initialValue;
    }
}

export class AbcEditor extends Disposable {

    public static readonly viewType = 'testWebviewEditor.abc';

    constructor(
        private readonly _extensionPath: string,
        private readonly uri: vscode.Uri,
        private readonly model: AbcModel,
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
                    this.model.makeEdit(edit);
                    break;
            }
        });

        panel.onDidDispose(() => { this.dispose(); })

        model.onUpdate(() => this.update());
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



    private async update() {
        if (this.isDisposed) {
            return;
        }

        this.panel.webview.postMessage({
            type: 'setValue',
            value: this.model.getContents()
        });
    }
}
