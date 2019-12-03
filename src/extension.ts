import * as vscode from 'vscode';
import { AbcEditor } from './abcEditor';
import { CatEditor } from './binaryEditor';

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerWebviewEditorProvider(AbcEditor.viewType, {
        resolveWebviewEditor: async (input, panel) => {
            return new AbcEditor(context.extensionPath, input.resource, panel);
        },
    })

    vscode.window.registerWebviewEditorProvider(CatEditor.viewType, {
        resolveWebviewEditor: async (input, panel) => {
            return new CatEditor(context.extensionPath, input.resource, panel);
        },
    })
}
