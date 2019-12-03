(function () {
    const vscode = acquireVsCodeApi();

    const textArea = document.querySelector('textarea');

    window.addEventListener('message', e => {
        switch (e.data.type) {
            case 'setValue':
                textArea.value = e.data.value;
                break;
        }
    })

    textArea.addEventListener('input', e => {
        vscode.postMessage({
            type: 'edit',
            value: textArea.value
        })
    });
}())
