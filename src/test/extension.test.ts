import * as assert from 'assert';
import { spawnSync } from 'child_process';
import { promises } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CustomEditorContentChangeEvent, customEditorContentChangeEventName } from '../abcEditor';
import { disposeAll } from '../dispose';
import { enableTestModeCommandName } from '../testing';
import { closeAllEditors } from './testUtils';


const testWorkspaceRoot = vscode.workspace.rootPath || '';
const testDocument = vscode.Uri.file(path.join(testWorkspaceRoot, 'x.abc'));

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
	setup((async () => {
		resetTestWorkspace();

		await vscode.commands.executeCommand(enableTestModeCommandName, true);
	}));

	teardown(async () => {
		await closeAllEditors();

		disposeAll(disposables);

		resetTestWorkspace();
	});

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

	test('Should support multiple undo', async () => {
		const startingContent = await promises.readFile(testDocument.fsPath)

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);
		await listener.nextResponse();


		const count = 10;

		// Make edits
		for (let i = 0; i < count; ++i) {
			await vscode.commands.executeCommand('_abcEditor.edit', `${i}`);
			const content = (await listener.nextResponse()).content;
			assert.equal(`${i}`, content);
		}

		// Then undo them in order
		for (let i = count - 1; i; --i) {
			await vscode.commands.executeCommand('editor.action.customEditor.undo');
			const content = (await listener.nextResponse()).content;
			assert.equal(`${i - 1}`, content);
		}

		{
			await vscode.commands.executeCommand('editor.action.customEditor.undo');
			const content = (await listener.nextResponse()).content;
			assert.equal(content, startingContent);
		}
	});

	test('Should update custom editor on file move', async () => {
		const startingContent = await promises.readFile(testDocument.fsPath)

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);
		await listener.nextResponse();


		const newFileName = vscode.Uri.file(path.join(testWorkspaceRoot, 'y.abc'));

		const edit = new vscode.WorkspaceEdit();
		edit.renameFile(testDocument, newFileName);

		await vscode.workspace.applyEdit(edit);

		const response = (await listener.nextResponse());
		assert.equal(response.content, startingContent);
		assert.equal(response.source.toString(), newFileName.toString());
	});

	test('Should support saving custom editors', async () => {
		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);
		await listener.nextResponse();

		const newContent = `new-${Date.now()}`;
		{
			await vscode.commands.executeCommand('_abcEditor.edit', newContent);
			const content = (await listener.nextResponse()).content;
			assert.equal(content, newContent);
		}
		{
			await vscode.commands.executeCommand('workbench.action.files.save');
			const fileContent = await promises.readFile(testDocument.fsPath)
			assert.equal(fileContent, newContent);
		}
	});

	test('Should undo after saving custom editor', async () => {
		const startingContent = await promises.readFile(testDocument.fsPath)

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand('vscode.open', testDocument);
		await listener.nextResponse();

		const newContent = `new-${Date.now()}`;
		{
			await vscode.commands.executeCommand('_abcEditor.edit', newContent);
			const content = (await listener.nextResponse()).content;
			assert.equal(content, newContent);
		}
		{
			await vscode.commands.executeCommand('workbench.action.files.save');
			const fileContent = await promises.readFile(testDocument.fsPath)
			assert.equal(fileContent, newContent);
		}
		{
			await vscode.commands.executeCommand('editor.action.customEditor.undo');
			const content = (await listener.nextResponse()).content;
			assert.equal(content, startingContent);
		}
	});


	test('Should support untitled custom editors', async () => {
		const listener = CustomEditorUpdateListener.create();

		const testFileName = 'z.abc';
		const untitledFile = vscode.Uri.parse(`untitled:${testFileName}`);

		await vscode.commands.executeCommand('vscode.open', untitledFile);
		assert.equal((await listener.nextResponse()).content, '');

		await vscode.commands.executeCommand('_abcEditor.edit', `123`);
		assert.equal((await listener.nextResponse()).content, '123');

		await vscode.commands.executeCommand('workbench.action.files.save');
		const content = await promises.readFile(path.join(testWorkspaceRoot, testFileName));
		assert.equal(content.toString(), '123');
	});
});

function resetTestWorkspace() {
	spawnSync(`git checkout -- "${testWorkspaceRoot}"`, { shell: true, cwd: testWorkspaceRoot });
	spawnSync(`git clean -f "${testWorkspaceRoot}"`, { shell: true, cwd: testWorkspaceRoot });
}
