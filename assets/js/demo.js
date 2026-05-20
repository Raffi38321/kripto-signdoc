function copyToDemo(elementId) {
    const element = document.getElementById(elementId);
    const text = element ? element.textContent : '';

    if (!text.trim()) {
        if (window.SignDocModal) {
            window.SignDocModal.warning('Peringatan', 'Tidak ada teks untuk disalin.');
        }
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        if (window.SignDocModal) {
            window.SignDocModal.success('Berhasil', 'Teks berhasil disalin ke clipboard!');
        }
    }).catch(() => {
        // Fallback untuk browser lama
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        if (window.SignDocModal) {
            window.SignDocModal.success('Berhasil', 'Teks berhasil disalin ke clipboard!');
        }
    });
}

