import * as vscode from 'vscode'
import * as path from 'path'
import { Disposable } from './dispose'

interface Edit {
    readonly points: [number, number][]
    readonly data: Uint8Array
}


export class CatDrawEditorProvider implements vscode.WebviewCustomEditorProvider, vscode.WebviewCustomEditorEditingDelegate {

    public static readonly viewType = 'testWebviewEditor.catDraw';

    private readonly models = new Map<string, CatDrawModel>();
    private readonly editors = new Map<string, Set<CatDrawEditor>>();

    public readonly editingDelegate?: vscode.WebviewCustomEditorEditingDelegate = this;

    public constructor(
        private readonly extensionPath: string
    ) { }

    public register(): vscode.Disposable {
        return vscode.window.registerWebviewCustomEditorProvider(CatDrawEditorProvider.viewType, this)
    }

    public async resolveWebviewEditor(resource: vscode.Uri, panel: vscode.WebviewPanel) {
        const model = await this.loadOrCreateModel(resource)
        const editor = new CatDrawEditor(this.extensionPath, model, resource, panel, {
            onEdit: (edit) => {
                model.pushEdits([edit])
                this._onEdit.fire({ resource, edit })
                this.update(resource, editor)
            }
        })

        // Clean up models when there are no editors for them.
        editor.onDispose(() => {
            const entry = this.editors.get(resource.toString())
            if (!entry) {
                return
            }
            entry.delete(editor)
            if (entry.size === 0) {
                this.editors.delete(resource.toString())
                this.models.delete(resource.toString())
            }
        })

        let editorSet = this.editors.get(resource.toString())
        if (!editorSet) {
            editorSet = new Set()
            this.editors.set(resource.toString(), editorSet)
        }
        editorSet.add(editor)
    }

    private async loadOrCreateModel(resource: vscode.Uri): Promise<CatDrawModel> {
        const existing = this.models.get(resource.toString())
        if (existing) {
            return existing
        }

        const newModel = await CatDrawModel.create(resource)
        this.models.set(resource.toString(), newModel)
        return newModel
    }

    private getModel(resource: vscode.Uri): CatDrawModel {
        const entry = this.models.get(resource.toString())
        if (!entry) {
            throw new Error('no model')
        }
        return entry
    }

    public async save(resource: vscode.Uri): Promise<void> {
        const model = this.getModel(resource)
        await vscode.workspace.fs.writeFile(resource, Buffer.from(model.getContent()))
    }

    public async saveAs(resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        const model = this.getModel(resource)
        await vscode.workspace.fs.writeFile(targetResource, Buffer.from(model.getContent()))
    }

    private readonly _onEdit = new vscode.EventEmitter<{ readonly resource: vscode.Uri, readonly edit: Edit }>();
    public readonly onEdit = this._onEdit.event;

    async applyEdits(resource: vscode.Uri, edits: readonly any[]): Promise<void> {
        const model = this.getModel(resource)
        model.pushEdits(edits)
        this.update(resource)
    }

    async undoEdits(resource: vscode.Uri, edits: readonly any[]): Promise<void> {
        const model = this.getModel(resource)
        model.popEdits(edits)
        this.update(resource)
    }

    private update(resource: vscode.Uri, trigger?: CatDrawEditor) {
        const editors = this.editors.get(resource.toString())
        if (!editors) {
            throw new Error(`No editors found for ${resource.toString()}`)
        }
        for (const editor of editors) {
            if (editor !== trigger) {
                editor.update()
            }
        }
    }
}

class CatDrawModel {
    private readonly _edits: Edit[] = [];

    public static async create(resource: vscode.Uri): Promise<CatDrawModel> {
        const buffer = await vscode.workspace.fs.readFile(resource)
        return new CatDrawModel(buffer)
    }

    private constructor(
        private readonly initialValue: Uint8Array
    ) { }

    public pushEdits(edits: readonly Edit[]): void {
        this._edits.push(...edits)
    }

    public popEdits(edits: readonly Edit[]): void {
        for (let i = 0; i < edits.length; ++i) {
            this._edits.pop()
        }
    }

    public getContent() {
        return this._edits.length ? this._edits[this._edits.length - 1].data : this.initialValue
    }

    public getStrokes() {
        return this._edits.map(x => x.points);
    }
}


export class CatDrawEditor extends Disposable {

    public static readonly viewType = 'testWebviewEditor.catDraw';

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    public readonly _onDispose = this._register(new vscode.EventEmitter<void>());
    public readonly onDispose = this._onDispose.event;

    constructor(
        private readonly _extensionPath: string,
        private readonly model: CatDrawModel,
        private readonly uri: vscode.Uri,
        private readonly panel: vscode.WebviewPanel,
        private readonly delegate: {
            onEdit: (edit: Edit) => void
        }
    ) {
        super()

        panel.webview.options = {
            enableScripts: true,
        }
        panel.webview.html = this.html

        panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'stroke':
                    const edit: Edit = { points: message.value.points, data: new Uint8Array(message.value.data.data) }
                    this.delegate.onEdit(edit)
                    break
            }
        })
        this._register(panel.onDidDispose(() => { this.dispose() }))

        this.update()
        this.setInitialContent()
    }

    public dispose() {
        if (this.isDisposed) {
            return
        }

        this._onDispose.fire()
        super.dispose()
    }

    private async setInitialContent(): Promise<void> {
        setTimeout(() => {
            this.panel.webview.postMessage({
                type: 'init',
                value: this.panel.webview.asWebviewUri(this.uri).toString()
            });
        }, 100);
    }

    private get html() {
        const contentRoot = path.join(this._extensionPath, 'content')
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
        </html>`
    }

    public async update() {
        if (this.isDisposed) {
            return
        }

        this.panel.webview.postMessage({
            type: 'setValue',
            value: this.model.getStrokes()
        })
    }
}
