import * as vscode from 'vscode';
import { AbcEditor } from './abcEditor';


export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerWebviewEditorProvider(AbcEditor.viewType, {
        resolveWebviewEditor: async (input, panel) => {
            return new AbcEditor(input.resource, panel);
        },
    })
}
