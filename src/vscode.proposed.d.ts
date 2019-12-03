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

	/**
	 * Defines how a webview editor interacts with VS Code.
	 */
	interface WebviewEditorCapabilities {
		/**
		 * Invoked when the resource has been renamed in VS Code.
		 *
		 * This is called when the resource's new name also matches the custom editor selector.
		 *
		 * If this is not implemented—or if the new resource name does not match the existing selector—then VS Code
		 * will close and reopen the editor on  rename.
		 *
		 * @param newResource Full path to the resource.
		 *
		 * @return Thenable that signals the save is complete.
		 */
		// rename?(newResource: Uri): Thenable<void>;

		/**
		 * Controls the editing functionality of a webview editor. This allows the webview editor to hook into standard
		 * editor events such as `undo` or `save`.
		 *
		 * WebviewEditors that do not have `editingCapability` are considered to be readonly. Users can still interact
		 * with readonly editors, but these editors will not integrate with VS Code's standard editor functionality.
		 */
		readonly editingCapability?: WebviewEditorEditingCapability;
	}

	/**
	 * Defines the editing functionality of a webview editor. This allows the webview editor to hook into standard
	 * editor events such as `undo` or `save`.
	 */
	interface WebviewEditorEditingCapability {
		/**
		 * Persist the resource.
		 *
		 * Extensions should persist the resource
		 *
		 * @return Thenable signaling that the save has completed.
		 */
		save(): Thenable<void>;

		/**
		 *
		 * @param resource Resource being saved.
		 * @param targetResource Location to save to.
		 */
		saveAs(resource: Uri, targetResource: Uri): Thenable<void>;

		/**
		 * Event triggered by extensions to signal to VS Code that an edit has occurred.
		 *
		 * The edit must be a json serializable object.
		 */
		readonly onEdit: Event<any>;

		/**
		 * Apply a set of edits.
		 *
		 * This is triggered on redo and when restoring a custom editor after restart. Note that is not invoked
		 * when `onEdit` is called as `onEdit` implies also updating the view to reflect the edit.
		 *
		 * @param edit Array of edits. Sorted from oldest to most recent.
		 */
		applyEdits(edits: readonly any[]): Thenable<void>;

		/**
		 * Undo a set of edits.
		 *
		 * This is triggered when a user undoes an edit or when revert is called on a file.
		 *
		 * @param edit Array of edits. Sorted from most recent to oldest.
		 */
		undoEdits(edits: readonly any[]): Thenable<void>;
	}

	export interface WebviewEditorProvider {
		/**
		 * Resolve a webview editor for a given resource.
		 *
		 * To resolve a webview editor, a provider must fill in its initial html content and hook up all
		 * the event listeners it is interested it. The provider should also take ownership of the passed in `WebviewPanel`.
		 *
		 * @param input Information about the resource being resolved.
		 * @param webview Webview being resolved. The provider should take ownership of this webview.
		 *
		 * @return Thenable to a `WebviewEditorCapabilities` indicating that the webview editor has been resolved.
		 *   The `WebviewEditorCapabilities` defines how the custom editor interacts with VS Code.
		 */
		resolveWebviewEditor(
			input: {
				readonly resource: Uri
			},
			webview: WebviewPanel,
		): Thenable<WebviewEditorCapabilities>;
	}

	namespace window {
		/**
		 * Register a new provider for webview editors of a given type.
		 *
		 * @param viewType  Type of the webview editor provider.
		 * @param provider Resolves webview editors.
		 * @param options Content settings for a webview panels the provider is given.
		 *
		 * @return Disposable that unregisters the `WebviewEditorProvider`.
		 */
		export function registerWebviewEditorProvider(
			viewType: string,
			provider: WebviewEditorProvider,
			options?: WebviewPanelOptions,
		): Disposable;
	}
}
