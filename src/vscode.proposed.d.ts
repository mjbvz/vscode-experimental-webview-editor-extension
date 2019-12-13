/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the place for API experiments and proposals.
 * These API are NOT stable and subject to change. They are only available in the Insiders
 * distribution and CANNOT be used in published extensions.
 *
 * To test these API in local environment:
 * - Use Insiders release of VS Code.
 * - Add `"enableProposedApi": true` to your package.json.
 * - Copy this file to your project.
 */

declare module 'vscode' {

	interface WebviewCustomEditorEditingDelegate {
		save(resource: Uri): Thenable<void>;
		saveAs(resource: Uri, targetResource: Uri): Thenable<void>;

		readonly onEdit: Event<{ resource: Uri }>;

		applyEdits(resource: Uri, edits: readonly any[]): Thenable<void>;
		undoEdits(resource: Uri, edits: readonly any[]): Thenable<void>;
	}

	export interface WebviewCustomEditorProvider {
		resolveWebviewEditor(resource: Uri, webview: WebviewPanel): Thenable<void>;

		readonly editingDelegate?: WebviewCustomEditorEditingDelegate;
	}

	namespace window {
		export function registerWebviewCustomEditorProvider(viewType: string, provider: WebviewCustomEditorProvider, options?: WebviewPanelOptions): Disposable;
	}
}
