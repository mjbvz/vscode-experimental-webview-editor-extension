import * as vscode from 'vscode';
import { AbcEditorProvider } from './abcEditor';
import { CatEditor } from './binaryEditor';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new AbcEditorProvider(context.extensionPath).register());
    
    // vscode.window.registerWebviewEditorProvider(CatEditor.viewType, {
    //     resolveWebviewEditor: async (input, panel) => {
    //         return new CatEditor(context.extensionPath, input.resource, panel);
    //     },
    // }) 
    
}
