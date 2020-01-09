// @ts-check
(function () {
    const vscode = acquireVsCodeApi();

    const textArea = document.querySelector('textarea');

    const initialState = vscode.getState();
    if (initialState) {
        textArea.value = initialState.value;
    }

    window.addEventListener('message', e => {
        switch (e.data.type) {
            case 'setValue':
                const value = e.data.value;
                textArea.value = value;
                vscode.setState({ value });

                vscode.postMessage({
                    type: 'didChangeContent',
                    value: value
                });
                break;
        }
    });

    textArea.addEventListener('input', e => {
        const value = textArea.value;
        vscode.setState({ value });
        vscode.postMessage({
            type: 'edit',
            value: value
        });

        vscode.postMessage({
            type: 'didChangeContent',
            value: value
        });
    });
}());
