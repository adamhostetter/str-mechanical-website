/* ============================================================
   FirstCall site.js — shared interactions for every page.
   No framework, no dependencies. Defensive about missing nodes
   so individual pages can opt in by adding the markup.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Mobile nav toggle ---------- */
  function initMobileNav() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var nav = document.querySelector("[data-site-nav]");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });

    // Close the menu when a nav link is followed.
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });

    // Close on Escape.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
        toggle.focus();
      }
    });
  }

  /* ---------- Header shadow on scroll ---------- */
  function initHeaderScroll() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var ticking = false;

    function update() {
      if (window.scrollY > 8) {
        header.classList.add("is-scrolled");
      } else {
        header.classList.remove("is-scrolled");
      }
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    update();
  }

  /* ---------- Map preview pin popovers ---------- */
  function initMapPins() {
    var pins = document.querySelectorAll("[data-map-pin]");
    if (!pins.length) return;

    pins.forEach(function (pin) {
      pin.addEventListener("mouseenter", function () { pin.classList.add("is-active"); });
      pin.addEventListener("mouseleave", function () { pin.classList.remove("is-active"); });
      pin.addEventListener("focus",      function () { pin.classList.add("is-active"); });
      pin.addEventListener("blur",       function () { pin.classList.remove("is-active"); });
    });
  }

  /* ---------- Nav dropdowns (Services + STR Locations) ---------- */
  function initNavDropdown() {
    var dropdowns = document.querySelectorAll("[data-dropdown]");
    if (!dropdowns.length) return;

    function closeAll() {
      dropdowns.forEach(function (wrap) {
        var menu = wrap.querySelector("[data-dropdown-menu]");
        var toggle = wrap.querySelector("[data-dropdown-toggle]");
        if (menu) menu.classList.remove("is-open");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      });
    }

    dropdowns.forEach(function (wrap) {
      var toggle = wrap.querySelector("[data-dropdown-toggle]");
      var menu = wrap.querySelector("[data-dropdown-menu]");
      if (!toggle || !menu) return;
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var wasOpen = menu.classList.contains("is-open");
        closeAll();
        if (!wasOpen) {
          menu.classList.add("is-open");
          toggle.setAttribute("aria-expanded", "true");
        }
      });
    });

    document.addEventListener("click", function (e) {
      var inside = false;
      dropdowns.forEach(function (w) { if (w.contains(e.target)) inside = true; });
      if (!inside) closeAll();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });
  }

  /* ---------- Industries honeycomb scroll-in ----------
     Hexes start with opacity:0 (set in branch.css). Reveal them in
     staggered sequence when the SVG enters the viewport. Observe the
     parent <svg>, not the inner <g> nodes — WebKit mobile does not
     fire IntersectionObserver reliably for SVG <g> children. */
  function initIndustries() {
    var svg = document.querySelector(".industries-honeycomb");
    if (!svg) return;
    var hexes = svg.querySelectorAll(".industry-hex");
    if (!hexes.length) return;

    function reveal() {
      hexes.forEach(function (h, idx) {
        setTimeout(function () { h.classList.add("is-visible"); }, idx * 70);
      });
    }

    var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !("IntersectionObserver" in window)) {
      hexes.forEach(function (h) { h.classList.add("is-visible"); });
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal();
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.15 });
    obs.observe(svg);
  }

  /* ---------- Hero video (slow playback + loop at midpoint) ----------
     The Charlotte flyover pans one direction then returns; cut the
     loop at the midpoint so only the forward pan plays, then seamlessly
     restart. Slow playback rate for cinematic feel. */
  function initHeroVideo() {
    var v = document.querySelector("[data-hero-video]");
    if (!v) return;
    v.playbackRate = 0.7;

    var loopAt = null;
    v.addEventListener("loadedmetadata", function () {
      if (isFinite(v.duration) && v.duration > 0) {
        loopAt = v.duration / 2;
      }
    });
    v.addEventListener("timeupdate", function () {
      if (loopAt && v.currentTime >= loopAt) {
        v.currentTime = 0;
      }
    });

    // Browsers may block autoplay until user interaction — retry on first interaction.
    function kick() {
      v.play().catch(function () {});
      window.removeEventListener("scroll", kick);
      window.removeEventListener("touchstart", kick);
      window.removeEventListener("click", kick);
    }
    v.play().catch(function () {
      window.addEventListener("scroll", kick, { passive: true, once: true });
      window.addEventListener("touchstart", kick, { passive: true, once: true });
      window.addEventListener("click", kick, { once: true });
    });
  }

  /* ---------- Hero photo parallax (for image-based heroes) ----------
     Translates the .branch-hero__photo-wrap upward as the user scrolls
     past the hero. Combined with the Ken Burns CSS animation on the
     inner <img>, this gives a cinematic, scroll-driven motion for
     branches that don't have a flyover video. Disabled on
     prefers-reduced-motion. */
  function initHeroParallax() {
    var wrap = document.querySelector("[data-hero-parallax]");
    if (!wrap) return;

    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var hero = wrap.closest(".branch-hero") || wrap.parentElement;
    if (!hero) return;

    var ticking = false;
    function update() {
      var rect = hero.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        var offset = -rect.top * 0.35;
        wrap.style.transform = "translate3d(0, " + offset.toFixed(2) + "px, 0)";
      }
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  /* ---------- Boot ---------- */
  function boot() {
    initMobileNav();
    initHeaderScroll();
    initMapPins();
    initNavDropdown();
    initIndustries();
    initHeroVideo();
    initHeroParallax();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
