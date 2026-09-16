/* =========================================================
   ELIO — MAIN SITE JAVASCRIPT
   Handles: navigation, mobile menu, smooth scroll,
   scroll reveal animations, and the FAQ accordion.
   Used on: index.html (and lightly on other pages).
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {
  initializeNavigation();
  initializeSmoothScroll();
  initializeScrollReveal();
  initializeFAQ();
});

/**
 * Wires up the mobile hamburger menu: opens/closes the panel,
 * closes when a link is clicked, and updates aria-expanded.
 */
function initializeNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");

  if (!toggle || !mobileMenu) return;

  toggle.addEventListener("click", function () {
    const isOpen = mobileMenu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  // Close the mobile menu whenever a link inside it is clicked
  mobileMenu.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      mobileMenu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  // Close the mobile menu when clicking outside of it
  document.addEventListener("click", function (event) {
    const clickedInsideMenu = mobileMenu.contains(event.target);
    const clickedToggle = toggle.contains(event.target);

    if (!clickedInsideMenu && !clickedToggle) {
      mobileMenu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

/**
 * Enables smooth scrolling for any in-page anchor link
 * (e.g. navbar links pointing to #how-it-works).
 */
function initializeSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      const targetId = link.getAttribute("href");
      if (targetId.length <= 1) return;

      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      event.preventDefault();
      const navbarHeight = document.querySelector(".navbar")
        ? document.querySelector(".navbar").offsetHeight
        : 0;
      const targetPosition = targetEl.getBoundingClientRect().top + window.scrollY - navbarHeight - 16;

      window.scrollTo({ top: targetPosition, behavior: "smooth" });
    });
  });
}

/**
 * Uses IntersectionObserver to fade-up elements with the
 * `.reveal` class as they enter the viewport.
 */
function initializeScrollReveal() {
  const revealEls = document.querySelectorAll(".reveal");
  if (!revealEls.length) return;

  if (!("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealEls.forEach(function (el) {
    observer.observe(el);
  });
}

/**
 * Builds an accessible accordion for the FAQ section.
 * Multiple items are allowed to stay open at once.
 */
function initializeFAQ() {
  const faqItems = document.querySelectorAll(".faq-item");
  if (!faqItems.length) return;

  faqItems.forEach(function (item) {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    if (!question || !answer) return;

    question.addEventListener("click", function () {
      const isExpanded = question.getAttribute("aria-expanded") === "true";

      question.setAttribute("aria-expanded", String(!isExpanded));

      if (isExpanded) {
        answer.style.maxHeight = null;
      } else {
        answer.style.maxHeight = answer.scrollHeight + "px";
      }
    });

    // Allow keyboard activation with Enter/Space (native for <button>,
    // this is a safety net in case the markup changes to a div).
    question.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        question.click();
      }
    });
  });
}
