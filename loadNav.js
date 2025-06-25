(async function loadNav() {
  const container = document.getElementById('navbar-placeholder');
  if (!container) return;
  try {
    const res = await fetch('nav.html');
    const html = await res.text();
    container.innerHTML = html;
    const hamburger = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');
    hamburger?.addEventListener('click', () => {
      navLinks.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        navLinks.classList.remove('show');
      }
    });
  } catch (err) {
    console.error('Error loading navigation:', err);
  }
})();

