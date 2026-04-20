// Handle hash scroll on page load
if (window.location.hash) {
  setTimeout(() => {
    const el = document.querySelector(window.location.hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 500);
}
