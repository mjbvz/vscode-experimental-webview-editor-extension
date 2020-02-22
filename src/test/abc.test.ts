import * as assert from 'assert';
import { spawnSync } from 'child_process';
import { promises } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Testing } from '../abcEditor';
import { disposeAll } from '../dispose';
import { enableTestModeCommandName } from '../testing';
import { closeAllEditors, writeRandomFile, wait, randomFilePath } from './testUtils';

const commands = Object.freeze({
	open: 'vscode.open',
	openWith: 'vscode.openWith',
	save: 'workbench.action.files.save',
	undo: 'editor.action.customEditor.undo',
});

assert.ok(vscode.workspace.rootPath);
const testWorkspaceRoot = vscode.Uri.file(vscode.workspace.rootPath!);
 
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

	private readonly unconsumedResponses: Array<Testing.CustomEditorContentChangeEvent> = [];
	private readonly callbackQueue: Array<(data: Testing.CustomEditorContentChangeEvent) => void> = [];

	private constructor() {
		this.commandSubscription = vscode.commands.registerCommand(Testing.abcEditorContentChangeCommand, (data: Testing.CustomEditorContentChangeEvent) => {
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

	async nextResponse(): Promise<Testing.CustomEditorContentChangeEvent> {
		if (this.unconsumedResponses.length) {
			return this.unconsumedResponses.shift()!;
		}

		return new Promise(resolve => {
			this.callbackQueue.push(resolve);
		});
	}
}


suite('Abc editor tests', () => {
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
		const startingContent = `load, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);

		const { content } = await listener.nextResponse();
		assert.equal(content, startingContent);
	});

	test('Should support basic edits', async () => {
		const startingContent = `basic edit, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await listener.nextResponse();

		const newContent = `basic edit test`;
		await vscode.commands.executeCommand(Testing.abcEditorTypeCommand, newContent);
		const { content } = await listener.nextResponse();
		assert.equal(content, newContent);
	});

	test('Should support single undo', async () => {
		const startingContent = `single undo, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await listener.nextResponse();

		const newContent = `undo test`;
		{
			await vscode.commands.executeCommand(Testing.abcEditorTypeCommand, newContent);
			const { content } = await listener.nextResponse();
			assert.equal(content, newContent);
		}
		await wait(100);
		{
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await listener.nextResponse();
			assert.equal(content, startingContent);
		}
	});

	test('Should support multiple undo', async () => {
		const startingContent = `multiple undo, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await listener.nextResponse();

		const count = 10;

		// Make edits
		for (let i = 0; i < count; ++i) {
			await vscode.commands.executeCommand(Testing.abcEditorTypeCommand, `${i}`);
			const { content } = await listener.nextResponse();
			assert.equal(`${i}`, content);
		}

		// Then undo them in order
		for (let i = count - 1; i; --i) {
			await wait(100);
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await listener.nextResponse();
			assert.equal(`${i - 1}`, content);
		}

		{
			await wait(100);
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await listener.nextResponse();
			assert.equal(content, startingContent);
		}
	});

	test('Should update custom editor on file move', async () => {
		const startingContent = `file move, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await listener.nextResponse();

		const newFileName = vscode.Uri.file(path.join(testWorkspaceRoot.fsPath, 'y.abc'));

		const edit = new vscode.WorkspaceEdit();
		edit.renameFile(testDocument, newFileName);

		await vscode.workspace.applyEdit(edit);

		const response = (await listener.nextResponse());
		assert.equal(response.content, startingContent);
		assert.equal(response.source.toString(), newFileName.toString());
	});

	test('Should support saving custom editors', async () => {
		const startingContent = `save, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await listener.nextResponse();

		const newContent = `save, new`;
		{
			await vscode.commands.executeCommand(Testing.abcEditorTypeCommand, newContent);
			const { content } = await listener.nextResponse();
			assert.equal(content, newContent);
		}
		{
			await vscode.commands.executeCommand(commands.save);
			const fileContent = (await promises.readFile(testDocument.fsPath)).toString();
			assert.equal(fileContent, newContent);
		}
	});

	test('Should undo after saving custom editor', async () => {
		const startingContent = `undo after save, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		await vscode.commands.executeCommand(commands.open, testDocument);
		await listener.nextResponse();

		const newContent = `undo after save, new`;
		{
			await vscode.commands.executeCommand(Testing.abcEditorTypeCommand, newContent);
			const { content } = await listener.nextResponse();
			assert.equal(content, newContent);
		}
		{
			await vscode.commands.executeCommand(commands.save);
			const fileContent = (await promises.readFile(testDocument.fsPath)).toString();
			assert.equal(fileContent, newContent);
		}
		await wait(100);
		{
			await vscode.commands.executeCommand(commands.undo);
			const { content } = await listener.nextResponse();
			assert.equal(content, startingContent);
		}
	});

	test.skip('Should support untitled custom editors', async () => {
		const listener = CustomEditorUpdateListener.create();

		const untitledFile = randomFilePath({ ext: '.abc' }).with({ scheme: 'untitled' });

		await vscode.commands.executeCommand(commands.open, untitledFile);
		assert.equal((await listener.nextResponse()).content, '');

		await vscode.commands.executeCommand(Testing.abcEditorTypeCommand, `123`);
		assert.equal((await listener.nextResponse()).content, '123');

		await vscode.commands.executeCommand(commands.save);
		const content = await promises.readFile(untitledFile.fsPath);
		assert.equal(content.toString(), '123');
	});

	test('When switching away from a non-default custom editors and then back, we should continue using the non-default editor', async () => {
		const startingContent = `switch, init`;
		const testDocument = await writeRandomFile({ ext: '.abc', contents: startingContent });

		const listener = CustomEditorUpdateListener.create();

		{
			await vscode.commands.executeCommand(commands.open, testDocument, { preview: false });
			const { content } = await listener.nextResponse();
			assert.equal(content, startingContent.toString());
			assert.ok(!vscode.window.activeTextEditor);
		}

		// Switch to non-default editor
		await vscode.commands.executeCommand(commands.openWith, testDocument, 'default', { preview: false });
		assert.ok(!vscode.window.activeTextEditor)

		// Then open a new document (hiding existing one)
		await vscode.commands.executeCommand(commands.open, vscode.Uri.file(path.join(testWorkspaceRoot.fsPath, 'other.json')));
		assert.ok(vscode.window.activeTextEditor)

		// And then back
		await vscode.commands.executeCommand('workbench.action.navigateBack');
		await vscode.commands.executeCommand('workbench.action.navigateBack');

		// Make sure we have the file on as text
		assert.ok(vscode.window.activeTextEditor);
		assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), testDocument.toString());
	});
});

function resetTestWorkspace() {
	const root = testWorkspaceRoot.fsPath;
	spawnSync(`git checkout -- "${root}"`, { shell: true, cwd: root });
	spawnSync(`git clean -f "${root}"`, { shell: true, cwd: root });
}
