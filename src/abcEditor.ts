import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { Disposable } from './dispose';
import { TestModeProvider } from './testing';
import * as crypto from 'crypto';


export const customEditorContentChangeEventName = '_abcEditor.contentChange';

export interface CustomEditorContentChangeEvent {
    content: string;
    source: vscode.Uri;
}

interface Edit {
    readonly value: string;
}

export class AbcEditorProvider implements vscode.WebviewCustomEditorProvider, vscode.WebviewCustomEditorEditingDelegate<Edit> {

    public static readonly viewType = 'testWebviewEditor.abc';

    private readonly models = new Map<string, AbcModel>();
    private readonly editors = new Map<string, Set<AbcEditor>>();

    private activeEditor?: AbcEditor;

    public readonly editingDelegate?: vscode.WebviewCustomEditorEditingDelegate<Edit> = this;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly testModeProvider: TestModeProvider,
    ) { }

    public register(): vscode.Disposable {
        const provider = vscode.window.registerWebviewCustomEditorProvider(AbcEditorProvider.viewType, this);

        const commands: vscode.Disposable[] = [];
        commands.push(vscode.commands.registerCommand('_abcEditor.edit', (content: string) => {
            if (!this.activeEditor) {
                return;
            }
            this.activeEditor.pushEdit(content, true);
        }));

        return vscode.Disposable.from(provider, ...commands);
    }

    public async resolveWebviewEditor(resource: vscode.Uri, panel: vscode.WebviewPanel) {
        const model = await this.loadOrCreateModel(resource);
        const editor = new AbcEditor(resource, this.context.extensionPath, model, panel, this.testModeProvider, {
            onEdit: (edit, external) => {
                model.pushEdits([edit]);
                this._onEdit.fire({ resource, edit });
                this.update(resource, external ? undefined : editor);
            }
        });

        // Clean up models when there are no editors for them.
        editor.onDispose(() => {
            if (this.activeEditor === editor) {
                this.activeEditor = undefined;
            }

            const entry = this.editors.get(resource.toString());
            if (!entry) {
                return
            }
            entry.delete(editor);
            if (entry.size === 0) {
                this.editors.delete(resource.toString());
                this.models.delete(resource.toString());
            }
        });

        this.activeEditor = editor;

        editor.onDidChangeViewState((e) => {
            if (this.activeEditor === editor && !e.webviewPanel.active) {
                this.activeEditor = undefined;
            }
            if (e.webviewPanel.active) {
                this.activeEditor = editor;
            }
        });

        let editorSet = this.editors.get(resource.toString());
        if (!editorSet) {
            editorSet = new Set();
            this.editors.set(resource.toString(), editorSet);
        }
        editorSet.add(editor);
    }

    private async loadOrCreateModel(resource: vscode.Uri): Promise<AbcModel> {
        const existing = this.models.get(resource.toString());
        if (existing) {
            return existing;
        }

        const backupResource = await this.getBackupResource(resource);
        const hasBackup = fs.existsSync(backupResource);
        const newModel = await AbcModel.create(resource, hasBackup ? vscode.Uri.file(backupResource) : undefined);
        this.models.set(resource.toString(), newModel);
        return newModel;
    }

    private getModel(resource: vscode.Uri): AbcModel {
        const entry = this.models.get(resource.toString());
        if (!entry) {
            throw new Error('no model');
        }
        return entry;
    }

    public async save(resource: vscode.Uri): Promise<void> {
        const model = this.getModel(resource);

        let pathToWrite = resource;
        if (resource.scheme === 'untitled') {
            pathToWrite = vscode.Uri.file(path.join(vscode.workspace.rootPath!, resource.path));
        }

        const backupResource = await this.getBackupResource(resource);
        await vscode.workspace.fs.writeFile(pathToWrite, Buffer.from(model.getContent()));
        if (fs.existsSync(backupResource)) {
            await fs.promises.unlink(backupResource);
        }
    }

    public async saveAs(resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        const model = this.getModel(resource);
        const backupResource = await this.getBackupResource(resource);s
        await vscode.workspace.fs.writeFile(targetResource, Buffer.from(model.getContent()));

        if (fs.existsSync(backupResource)) {
            await fs.promises.unlink(backupResource);
        }
    }

    private readonly _onEdit = new vscode.EventEmitter<{ readonly resource: vscode.Uri, readonly edit: Edit }>();
    public readonly onEdit = this._onEdit.event;

    async applyEdits(resource: vscode.Uri, edits: readonly Edit[]): Promise<void> {
        const model = this.getModel(resource);
        model.pushEdits(edits);
        this.update(resource);
    }

    async undoEdits(resource: vscode.Uri, edits: readonly Edit[]): Promise<void> {
        const model = this.getModel(resource);
        model.popEdits(edits);
        this.update(resource);
    }

    async backup(resource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<boolean> {
        const existing = this.models.get(resource.toString());
        if (!existing) {
            return false;
        }
        const backupResource = await this.getBackupResource(resource);
        console.log(`Backing up ${resource} to ${backupResource}`);
        await fs.promises.writeFile(backupResource, existing.getContent());
        return true;
    }

    private update(resource: vscode.Uri, trigger?: AbcEditor) {
        const editors = this.editors.get(resource.toString());
        if (!editors) {
            throw new Error(`No editors found for ${resource.toString()}`);
        }
        for (const editor of editors) {
            if (editor !== trigger) {
                editor.update();
            }
        }
    }

    private async getBackupResource(resource: vscode.Uri): Promise<string> {
        const backupPath = await this.getBackupPath();
        return path.join(backupPath, this.hashPath(resource));
    }

    private async getBackupPath(): Promise<string> {
        const backupPath = path.join(this.context.storagePath!, 'backups');
        await fs.promises.mkdir(backupPath, { recursive: true })
        return backupPath;
    }

    private hashPath(resource: vscode.Uri): string {
        const str = resource.scheme === 'file' || resource.scheme === 'untitled' ? resource.fsPath : resource.toString();
        return crypto.createHash('sha256').update(str, 'utf8').digest('hex')
    }
}

export class AbcModel {
    private readonly _edits: Edit[] = [];

    public static async create(resource: vscode.Uri, backupResource: vscode.Uri | undefined): Promise<AbcModel> {
        if (resource.scheme === 'untitled') {
            return new AbcModel('');
        }

        if (backupResource) {
            console.log('restoring from backup');
        }

        const buffer = await vscode.workspace.fs.readFile(backupResource ?? resource);
        const initialValue = Buffer.from(buffer).toString('utf8')
        return new AbcModel(initialValue);
    }

    private constructor(
        private readonly initialValue: string
    ) { }

    public pushEdits(edits: readonly Edit[]): void {
        this._edits.push(...edits);
    }

    public popEdits(edits: readonly Edit[]): void {
        for (let i = 0; i < edits.length; ++i) {
            this._edits.pop();
        }
    }

    public getContent() {
        return this._edits.length ? this._edits[this._edits.length - 1].value : this.initialValue;
    }
}

class AbcEditor extends Disposable {

    public readonly _onDispose = this._register(new vscode.EventEmitter<void>());
    public readonly onDispose = this._onDispose.event;

    public readonly _onDidChangeViewState = this._register(new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>());
    public readonly onDidChangeViewState = this._onDidChangeViewState.event;

    constructor(
        private readonly resource: vscode.Uri,
        private readonly _extensionPath: string,
        private readonly model: AbcModel,
        private readonly panel: vscode.WebviewPanel,
        private readonly testModeProvider: TestModeProvider,
        private readonly delegate: {
            onEdit: (edit: Edit, external?: boolean) => void
        }
    ) {
        super();

        panel.webview.options = {
            enableScripts: true,
        };
        panel.webview.html = this.html;

        this._register(panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'edit':
                    this.pushEdit(message.value);
                    break;

                case 'didChangeContent':
                    if (this.testModeProvider.inTestMode) {
                        vscode.commands.executeCommand(customEditorContentChangeEventName, {
                            content: message.value,
                            source: resource
                        } as CustomEditorContentChangeEvent);
                    }
                    break;
            }
        }));

        this._register(panel.onDidDispose(() => { this.dispose(); }));

        this._register(panel.onDidChangeViewState(e => { this._onDidChangeViewState.fire(e); }));

        this.update();
    }

    public pushEdit(value: string, external?: boolean) {
        this.delegate.onEdit({ value }, external);
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }

        this._onDispose.fire();
        super.dispose();
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

    public async update() {
        if (this.isDisposed) {
            return;
        }

        this.panel.webview.postMessage({
            type: 'setValue',
            value: this.model.getContent()
        });
    }
}
