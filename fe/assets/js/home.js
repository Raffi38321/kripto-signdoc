// Home page interactions (modal handled globally by assets/js/modal.js)
document.addEventListener('DOMContentLoaded', function () {
    // Smooth scrolling for in-page anchors
    document.querySelectorAll('a[href^=\"#\"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href) return;

            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
        });
    });
});

