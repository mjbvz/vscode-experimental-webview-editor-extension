import * as vscode from 'vscode';

export const enableTestModeCommandName = 'customEditorSamples.enableTestMode';

export class TestModeProvider {
    private readonly sub: vscode.Disposable;

    private _inTestMode = false;

    constructor() {
        this.sub = vscode.commands.registerCommand(enableTestModeCommandName, () => {
            this._inTestMode = true;
        })
    }

    get inTestMode(): boolean {
        return this._inTestMode;
    }

    dispose() {
        this.sub.dispose();
    }
}