import * as vscode from 'vscode';
import { AbcEditorManager } from './abcEditor';
import { CatEditor } from './binaryEditor';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new AbcEditorManager().register(context.extensionPath));
    
    // vscode.window.registerWebviewEditorProvider(CatEditor.viewType, {
    //     resolveWebviewEditor: async (input, panel) => {
    //         return new CatEditor(context.extensionPath, input.resource, panel);
    //     },
    // })
}
