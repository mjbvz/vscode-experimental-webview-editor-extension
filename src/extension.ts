import * as vscode from 'vscode';
import { AbcEditorProvider } from './abcEditor';
import { CatDrawEditorProvider } from './binaryEditor';
import { TestModeProvider } from './testing';

export function activate(context: vscode.ExtensionContext) {
    const testModeProvider = new TestModeProvider();
    
    context.subscriptions.push(new AbcEditorProvider(context.extensionPath, testModeProvider).register());
    
    context.subscriptions.push(new CatDrawEditorProvider(context.extensionPath).register()); 
}

