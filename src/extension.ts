import * as vscode from 'vscode';
import { AbcEditorProvider } from './abcEditor';
import { CatDrawEditor, CatDrawEditorProvider } from './binaryEditor';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new AbcEditorProvider(context.extensionPath).register());
    
    context.subscriptions.push(new CatDrawEditorProvider(context.extensionPath).register());
    
}
