/* ============================================================
   RESHUFFLE — Magazine flipbook engine
   - Scroll-driven 3D page turn (desktop / fine-pointer)
   - Flat vertical spreads fallback (touch / narrow / reduced motion)
   - Click-to-zoom lightbox for gallery imagery
   ============================================================ */
(function () {
    'use strict';

    var section = document.querySelector('.magazine');
    if (!section) return;

    var stage   = section.querySelector('.mag-stage');
    var book    = section.querySelector('.mag-book');
    var leaves  = Array.prototype.slice.call(book.querySelectorAll('.mag-leaf'));
    var bar     = section.querySelector('.mag-progress span');
    var counter = section.querySelector('.mag-counter');
    var hint    = section.querySelector('.mag-hint');
    var N       = leaves.length;

    /* ---- decide mode ---- */
    var reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarse  = window.matchMedia('(pointer: coarse)').matches;

    function isFlat() {
        return reduce || coarse || window.innerWidth <= 900;
    }

    var SCROLL_PER_PAGE = 0.8; // viewport heights of scroll per page turn

    function layout() {
        if (isFlat()) {
            section.classList.add('mag-flat');
            section.style.height = 'auto';
            // ensure videos are visible-friendly in flat mode
            return;
        }
        section.classList.remove('mag-flat');
        var vh = window.innerHeight;
        // +1 so the last page rests fully turned before the section releases
        section.style.height = Math.round((N + 1) * SCROLL_PER_PAGE * vh) + 'px';
        update();
    }

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    function update() {
        if (section.classList.contains('mag-flat')) return;

        var rect = section.getBoundingClientRect();
        var vh = window.innerHeight;
        var scrolled = -rect.top;
        var total = section.offsetHeight - vh;
        var progress = clamp(scrolled / total, 0, 1);
        var pos = progress * N; // 0..N, fractional = page mid-turn

        for (var i = 0; i < N; i++) {
            var t = clamp(pos - i, 0, 1);        // 0 = unturned (right), 1 = turned (left)
            var angle = t * -180;
            var lift = Math.sin(t * Math.PI) * 26; // arc the page up while turning
            leaves[i].style.transform =
                'translateZ(' + lift + 'px) rotateY(' + angle + 'deg)';

            // stacking: unturned -> lower index on top; turned -> higher index on top
            leaves[i].style.zIndex = (t < 0.5 ? (N - i) : (N + i)) + '';

            // sheen sweep mid-turn
            var sheen = leaves[i].querySelector('.leaf-sheen');
            if (sheen) sheen.style.opacity = (Math.sin(t * Math.PI) * 0.8).toFixed(3);
        }

        if (bar) bar.style.width = (progress * 100) + '%';
        var current = clamp(Math.round(pos) + 1, 1, N);
        if (counter) counter.innerHTML = '<b>' + pad(current) + '</b> / ' + pad(N);
        if (hint) hint.style.opacity = progress > 0.02 ? '0' : '0.8';

        // pause offscreen videos, play the active page's video
        toggleVideos(current - 1);
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    /* ---- video play/pause by active page ---- */
    function toggleVideos(activeIndex) {
        for (var i = 0; i < N; i++) {
            var vids = leaves[i].querySelectorAll('video');
            for (var v = 0; v < vids.length; v++) {
                if (i === activeIndex) {
                    if (vids[v].paused) { var p = vids[v].play(); if (p && p.catch) p.catch(function(){}); }
                } else {
                    vids[v].pause();
                }
            }
        }
    }

    /* ---- rAF-throttled scroll ---- */
    var ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { update(); ticking = false; });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    var rT;
    window.addEventListener('resize', function () {
        clearTimeout(rT);
        rT = setTimeout(layout, 150);
    });

    layout();
    // in flat mode, let videos autoplay when scrolled into view
    if (section.classList.contains('mag-flat')) {
        setupFlatVideos();
    }

    function setupFlatVideos() {
        if (!('IntersectionObserver' in window)) {
            book.querySelectorAll('video').forEach(function (vd) { vd.play().catch(function(){}); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                var vd = e.target;
                if (e.isIntersecting) { vd.play().catch(function(){}); }
                else { vd.pause(); }
            });
        }, { threshold: 0.4 });
        book.querySelectorAll('video').forEach(function (vd) { io.observe(vd); });
    }

    /* ============================================================
       LIGHTBOX
       ============================================================ */
    var lb = document.createElement('div');
    lb.className = 'mag-lightbox';
    lb.innerHTML =
        '<span class="lb-close" aria-label="Close">&times;</span>' +
        '<span class="lb-nav lb-prev" aria-label="Previous">&#8249;</span>' +
        '<span class="lb-nav lb-next" aria-label="Next">&#8250;</span>' +
        '<div class="lb-media"></div>';
    document.body.appendChild(lb);
    var lbMedia = lb.querySelector('.lb-media');

    // collect zoomable sources in document order
    var gallery = [];
    section.querySelectorAll('[data-zoom]').forEach(function (el) {
        gallery.push(el.getAttribute('data-zoom'));
    });
    var lbIndex = 0;

    function openLightbox(src) {
        lbIndex = Math.max(0, gallery.indexOf(src));
        renderLightbox();
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function renderLightbox() {
        var src = gallery[lbIndex];
        if (/\.(mp4|webm)$/i.test(src)) {
            lbMedia.innerHTML = '<video src="' + src + '" controls autoplay loop playsinline></video>';
        } else {
            lbMedia.innerHTML = '<img src="' + src + '" alt="">';
        }
    }
    function closeLightbox() {
        lb.classList.remove('open');
        lbMedia.innerHTML = '';
        document.body.style.overflow = '';
    }
    function step(d) {
        lbIndex = (lbIndex + d + gallery.length) % gallery.length;
        renderLightbox();
    }

    section.addEventListener('click', function (e) {
        var z = e.target.closest('[data-zoom]');
        if (z) { e.preventDefault(); openLightbox(z.getAttribute('data-zoom')); }
    });
    lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
    lb.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    lb.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target === lbMedia) closeLightbox(); });
    document.addEventListener('keydown', function (e) {
        if (!lb.classList.contains('open')) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowRight') step(1);
        else if (e.key === 'ArrowLeft') step(-1);
    });
})();
