// Global modal helper for SignDoc pages (no dependencies)
(function () {
    const ICONS = {
        info: '\u2139\uFE0F', // ℹ️
        success: '\u2705', // ✅
        warning: '\u26A0\uFE0F', // ⚠️
        error: '\u274C', // ❌
        confirm: '\u2753' // ❓
    };

    function ensureModalDOM() {
        let overlay = document.getElementById('modalOverlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'modalOverlay';
        overlay.className = 'modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-hidden', 'true');

        overlay.innerHTML = `
            <div class="modal-content" role="document">
                <div class="modal-header">
                    <div class="modal-icon" aria-hidden="true"></div>
                    <h2 class="modal-title"></h2>
                </div>
                <div class="modal-body"></div>
                <div class="modal-footer"></div>
            </div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    }

    class ModalController {
        constructor() {
            this.overlay = ensureModalDOM();
            this.titleEl = this.overlay.querySelector('.modal-title');
            this.bodyEl = this.overlay.querySelector('.modal-body');
            this.footerEl = this.overlay.querySelector('.modal-footer');
            this.iconEl = this.overlay.querySelector('.modal-icon');
            this._isOpen = false;

            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.close();
            });

            document.addEventListener('keydown', (e) => {
                if (!this._isOpen) return;
                if (e.key === 'Escape') this.close();
            });
        }

        show(title, message, type = 'info', buttons = []) {
            this._isOpen = true;
            this.overlay.setAttribute('aria-hidden', 'false');
            this.overlay.classList.add('active');

            this.iconEl.textContent = ICONS[type] || '\uD83D\uDCE2'; // 📢
            this.titleEl.textContent = title || '';
            this.bodyEl.textContent = message || '';

            this.footerEl.innerHTML = '';

            const normalizedButtons = Array.isArray(buttons) ? buttons : [];
            const finalButtons = normalizedButtons.length
                ? normalizedButtons
                : [{ text: 'OK', type: 'primary' }];

            finalButtons.forEach((button) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `modal-btn modal-btn-${button.type || 'primary'}`;
                btn.textContent = button.text || 'OK';
                btn.addEventListener('click', () => {
                    try {
                        if (typeof button.callback === 'function') button.callback();
                    } finally {
                        this.close();
                    }
                });
                this.footerEl.appendChild(btn);
            });

            // Focus first button for accessibility
            const firstBtn = this.footerEl.querySelector('button');
            if (firstBtn) firstBtn.focus();
        }

        close() {
            this._isOpen = false;
            this.overlay.setAttribute('aria-hidden', 'true');
            this.overlay.classList.remove('active');
        }

        confirm(title, message, onConfirm, onCancel, options = {}) {
            const confirmText = options.confirmText || 'Ya, Lanjutkan';
            const cancelText = options.cancelText || 'Batal';

            this.show(title, message, 'confirm', [
                { text: cancelText, type: 'secondary', callback: onCancel },
                { text: confirmText, type: 'primary', callback: onConfirm }
            ]);
        }

        warning(title, message, onAccept) {
            const buttons = typeof onAccept === 'function'
                ? [
                    { text: 'Tutup', type: 'secondary' },
                    { text: 'Mengerti', type: 'warning', callback: onAccept }
                ]
                : [];

            this.show(title, message, 'warning', buttons);
        }

        error(title, message) {
            this.show(title, message, 'error');
        }

        success(title, message) {
            this.show(title, message, 'success');
        }

        info(title, message) {
            this.show(title, message, 'info');
        }
    }

    // Expose globally
    window.SignDocModal = window.SignDocModal || new ModalController();

    // Backward-compatible helpers (optional)
    window.showWarning = function (title, message) {
        window.SignDocModal.warning(title, message);
    };
    window.showConfirmation = function (title, message, onConfirm, onCancel) {
        window.SignDocModal.confirm(title, message, onConfirm, onCancel);
    };
    window.showSuccess = function (title, message) {
        window.SignDocModal.success(title, message);
    };
    window.showError = function (title, message) {
        window.SignDocModal.error(title, message);
    };
    window.showInfo = function (title, message) {
        window.SignDocModal.info(title, message);
    };
})();

