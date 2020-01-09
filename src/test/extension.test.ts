import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { CustomEditorContentChangeEvent, customEditorContentChangeEventName } from '../abcEditor';
import { disposeAll } from '../dispose';
import { closeAllEditors } from './testUtils';


const testDocument = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', 'x.abc'));

suite('custom editor tests', () => {
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
		private callbackQueue: Array<(data: CustomEditorContentChangeEvent) => void> = [];

		private constructor() {
			this.commandSubscription = vscode.commands.registerCommand(customEditorContentChangeEventName, (data: CustomEditorContentChangeEvent) => {
				const callback = this.callbackQueue.shift();
				callback?.(data);
			});
		}

		dispose() {
			this.commandSubscription.dispose();
		}

		waitNextResponse(): Promise<CustomEditorContentChangeEvent> {
			return new Promise(resolve => {
				this.callbackQueue.push(resolve);
			});
		}
	}

	teardown(async () => {
		await closeAllEditors();
		disposeAll(disposables);
	});

	test('webviews should be able to send and receive messages', async () => {
		const listener = CustomEditorUpdateListener.create();
		const response = listener.waitNextResponse();

		await vscode.commands.executeCommand('vscode.open', testDocument);

		const content = (await response).content;
		assert.equal(content, '123\n');
	});
});
