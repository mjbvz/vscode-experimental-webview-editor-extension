import * as vscode from 'vscode';
import { resolve } from 'dns';
import * as fs from 'fs';

export function closeAllEditors(): Thenable<any> {
    return vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function rndName() {
    return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
}

export async function createRandomFile(dir: vscode.Uri, ext = '', contents: string): Promise<vscode.Uri> {
    const fakeFile = dir.with({ path: dir.path + '/' + rndName() + ext });
    await fs.promises.writeFile(fakeFile.fsPath, Buffer.from(contents));
    return fakeFile;
}