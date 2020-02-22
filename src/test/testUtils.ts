import * as vscode from 'vscode';
import * as assert from 'assert';
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

export function randomFilePath(options: { root?: vscode.Uri; ext?: string; }): vscode.Uri {
	let dir = options.root;
	if (!dir) {
		assert.ok(vscode.workspace.rootPath)
		dir = vscode.Uri.file(vscode.workspace.rootPath!);
	}
	return dir.with({ path: dir.path + '/' + rndName() + (options.ext || '') });
}

export async function writeRandomFile(options: { root?: vscode.Uri; ext: string; contents: string; }): Promise<vscode.Uri> {
	const fakeFile = randomFilePath({ root: options.root, ext: options.ext });
	await fs.promises.writeFile(fakeFile.fsPath, Buffer.from(options.contents));
	return fakeFile;
}