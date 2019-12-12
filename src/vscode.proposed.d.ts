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

	export interface BaseDocument {

		/**
		 * The associated uri for this document.
		 */
		readonly uri: Uri;

		/**
		 * The file system path of the associated resource. Shorthand
		 * notation for [TextDocument.uri.fsPath](#TextDocument.uri). Independent of the uri scheme.
		 */
		readonly fileName: string;

		/**
		 * Is this document representing an untitled file which has never been saved yet. *Note* that
		 * this does not mean the document will be saved to disk, use [`uri.scheme`](#Uri.scheme)
		 * to figure out where a document will be [saved](#FileSystemProvider), e.g. `file`, `ftp` etc.
		 */
		readonly isUntitled: boolean;

		/**
		 * `true` if there are unpersisted changes.
		 */
		readonly isDirty: boolean;

		/**
		 * `true` if the document has been closed. A closed document isn't synchronized anymore
		 * and won't be re-used when the same resource is opened again.
		 */
		readonly isClosed: boolean;

		/**
		 * Save the underlying file.
		 *
		 * @return A promise that will resolve to true when the file
		 * has been saved. If the file was not dirty or the save failed,
		 * will return false.
		 */
		save(): Thenable<boolean>;
	}

	interface CustomDocument<T extends CustomDocumentDelegate> extends BaseDocument {
		readonly delegate: T;
	}

	/**
	 * Defines how a webview editor interacts with VS Code.
	 */
	interface CustomDocumentDelegate {
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
		readonly editingDelegate?: WebviewEditorEditingDelegate;
	}

	/**
	 * Defines the editing functionality of a webview editor. This allows the webview editor to hook into standard
	 * editor events such as `undo` or `save`.
	 */
	interface WebviewEditorEditingDelegate {
		/**
		 * Persist the resource.
		 *
		 * Extensions should persist the resource
		 *
		 * @return Thenable signaling that the save has completed.
		 */
		save(document: CustomDocument): Thenable<void>;

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

	/**
	 * 
	 */
	export interface WebviewCustomEditorProvider {
		/**
		 * 
		 * @param document 
		 * @param webview 
		 */
		resolveWebviewEditor(document: CustomDocument, webview: WebviewPanel): Thenable<void>;
	}

	namespace window {
		/**
		 * Register a new provider for webview editors of a given type.
		 *
		 * @param id Type of the editors provided.
		 * @param provider Resolves webview editors.
		 * @param options Content settings for a webview panels the provider is given.
		 *
		 * @return Disposable that unregisters the `WebviewCustomEditorProvider`.
		 */
		export function registerWebviewCustomEditorProvider(viewType: string, provider: WebviewCustomEditorProvider, options?: WebviewPanelOptions): Disposable;

		/**
		 * Register a new provider for custom documents of a given type.
		 *
		 * @param id Type of the documents provided.
		 * @param provider Resolves custom documents.
		 *
		 * @return Disposable that unregisters the `CustomDocumentProvider`.
		 */
		export function registerCustomDocumentDelegate(documentType: string, delegate: CustomDocumentDelegate): Disposable;
	}
}
