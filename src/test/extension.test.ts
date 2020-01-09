import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { CustomEditorContentChangeEvent, customEditorContentChangeEventName } from '../abcEditor';
import { disposeAll } from '../dispose';
import { closeAllEditors, wait } from './testUtils';
import { enableTestModeCommandName } from '../testing';
import { promises } from 'fs';


const testDocument = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', 'x.abc'));

const disposables: vscode.Disposable[] = [];

function _register<T extends vscode.Disposable>(disposable: T) {
	disposables.push(disposable);
	return disposable;
}

class CustomEditorUpdateListener {

	public static create() {
		return _register(new CustomEditorUpdateListener());
	}

	private readonly commandSubscription: vscode.Disposable;

	private unconsumedResponses: Array<CustomEditorContentChangeEvent> = [];
	private callbackQueue: Array<(data: CustomEditorContentChangeEvent) => void> = [];

	private constructor() {
		this.commandSubscription = vscode.commands.registerCommand(customEditorContentChangeEventName, (data: CustomEditorContentChangeEvent) => {
			if (this.callbackQueue.length) {
				const callback = this.callbackQueue.shift();
				callback?.(data);
			} else {
				this.unconsumedResponses.push(data);
			}
		});
	}

	dispose() {
		this.commandSubscription.dispose();
	}

	async nextResponse(): Promise<CustomEditorContentChangeEvent> {
		if (this.unconsumedResponses.length) {
			return this.unconsumedResponses.shift()!;
		}

		return new Promise(resolve => {
			this.callbackQueue.push(resolve);
		});
	}
}


suite('custom editor tests', () => {
	teardown(async () => {
		await closeAllEditors();
		disposeAll(disposables);
	});

	setup((async () => {
		await vscode.commands.executeCommand(enableTestModeCommandName, true);
	}));

	test('Should load basic content from disk', async () => {
		const startingContent = await promises.readFile(testDocument.fsPath)

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);

		const content = (await listener.nextResponse()).content;
		assert.equal(content, startingContent.toString());
	});

	test('Should support basic edits', async () => {
		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);
		await listener.nextResponse();

		await vscode.commands.executeCommand('_abcEditor.edit', 'xyz');
		const content = (await listener.nextResponse()).content;
		assert.equal(content, 'xyz');
	});

	test('Should support single undo', async () => {
		const startingContent = await promises.readFile(testDocument.fsPath)

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);
		await listener.nextResponse();

		{
			await vscode.commands.executeCommand('_abcEditor.edit', 'xyz');
			const content = (await listener.nextResponse()).content;
			assert.equal(content, 'xyz');
		}

		{
			await vscode.commands.executeCommand('editor.action.customEditor.undo');
			const content = (await listener.nextResponse()).content;
			assert.equal(content, startingContent);
		}
	});
});
