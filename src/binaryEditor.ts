import * as vscode from 'vscode'
import * as path from 'path'
import { Disposable } from './dispose'

interface Edit {
    readonly points: [number, number][]
    readonly data: Uint8Array
}

export class CatDrawEditorProvider implements vscode.CustomEditorProvider, vscode.CustomEditorEditingDelegate<Edit> {

    public static readonly viewType = 'testWebviewEditor.catDraw';

    private readonly editors = new Map<string, Set<CatDrawEditor>>();

    public readonly editingDelegate = this;

    public constructor(
        private readonly extensionPath: string
    ) { }

    public register(): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(CatDrawEditorProvider.viewType, this)
    }

    async resolveCustomDocument(document: vscode.CustomDocument): Promise<void> {
        const model = await CatDrawModel.create(document.uri);
        document.userData = model;
        document.onDidDispose(() => {
            console.log('Dispose document')
            model.dispose();
        });

        model.onDidEdit(edit => {
            this._onDidEdit.fire({ document, edit });
        });
        model.onDidChange(() => {
            this.update(document.uri);
        });
    }

    public async resolveCustomEditor(document: DocumentType, panel: vscode.WebviewPanel) {
        const editor = new CatDrawEditor(this.extensionPath, document, panel)

        let editorSet = this.editors.get(document.uri.toString())
        if (!editorSet) {
            editorSet = new Set()
            this.editors.set(document.uri.toString(), editorSet)
        }
        editorSet.add(editor)
        editor.onDispose(() => editorSet?.delete(editor));
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

    //#region CustomEditorDelegate

    async save(document: DocumentType, _cancellation: vscode.CancellationToken): Promise<void> {
        return document.userData?.save()
    }

    async saveAs(document: DocumentType, targetResource: vscode.Uri): Promise<void> {
        return document.userData?.saveAs(targetResource)
    }

    private readonly _onDidEdit = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<Edit>>();
    public readonly onDidEdit = this._onDidEdit.event

    async applyEdits(document: DocumentType, edits: readonly Edit[]): Promise<void> {
        return document.userData?.applyEdits(edits)
    }

    async undoEdits(document: DocumentType, edits: readonly Edit[]): Promise<void> {
        return document.userData?.undoEdits(edits)
    }

    async revert(document: DocumentType, edits: vscode.CustomDocumentRevert): Promise<void> {
        return document.userData?.revert(edits)
    }

    async backup(document: DocumentType, cancellation: vscode.CancellationToken): Promise<void> {
        return document.userData?.backup()
    }

    //#endregion
}

class CatDrawModel extends Disposable {

    private readonly _edits: Edit[] = [];

    public static async create(resource: vscode.Uri): Promise<CatDrawModel> {
        const buffer = await vscode.workspace.fs.readFile(resource)
        return new CatDrawModel(resource, buffer)
    }

    private constructor(
        private readonly resource: vscode.Uri,
        private readonly initialValue: Uint8Array
    ) {
        super();
    }

    private readonly _onDidChange = this._register(new vscode.EventEmitter<void>());
    public readonly onDidChange = this._onDidChange.event;

    private readonly _onDidEdit = this._register(new vscode.EventEmitter<Edit>());
    public readonly onDidEdit = this._onDidEdit.event;

    public getContent() {
        return this._edits.length ? this._edits[this._edits.length - 1].data : this.initialValue
    }

    public onEdit(edit: Edit) {
        this._edits.push(edit)
        this._onDidEdit.fire(edit);
    }

    public getStrokes() {
        return this._edits.map(x => x.points);
    }

    public async save(): Promise<void> {
        await vscode.workspace.fs.writeFile(this.resource, Buffer.from(this.getContent()))
    }

    public async saveAs(targetResource: vscode.Uri): Promise<void> {
        await vscode.workspace.fs.writeFile(targetResource, Buffer.from(this.getContent()))
    }

    async applyEdits(edits: readonly Edit[]): Promise<void> {
        this._edits.push(...edits)
        this.update()
    }

    async undoEdits(edits: readonly Edit[]): Promise<void> {
        for (let i = 0; i < edits.length; ++i) {
            this._edits.pop()
        }
        this.update()
    }

    async revert(revert: vscode.CustomDocumentRevert): Promise<void> {
        // TODO
    }

    private update() {
        this._onDidChange.fire();
    }

    async backup() {
        // TODO
        return;
    }
}

type DocumentType = vscode.CustomDocument<CatDrawModel>;

export class CatDrawEditor extends Disposable {

    public static readonly viewType = 'testWebviewEditor.catDraw';

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    public readonly _onDispose = this._register(new vscode.EventEmitter<void>());
    public readonly onDispose = this._onDispose.event;

    constructor(
        private readonly _extensionPath: string,
        private readonly document: DocumentType,
        private readonly panel: vscode.WebviewPanel
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
                    this.document.userData?.onEdit(edit)
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
                value: this.panel.webview.asWebviewUri(this.document.uri).toString()
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
            value: this.document.userData!.getStrokes()
        })
    }
}
