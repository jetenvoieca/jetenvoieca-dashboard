// Shared across index.html, story.html, contact.html, artists.html, retail.html,
// and page.html. Renders the site nav from content.json's navPages order,
// including any custom pages, respecting visibility and "show in menu".
var BESPOKE_NAV_PAGES = {
  home: { label: 'Home', href: 'index.html' },
  story: { label: 'Story', href: 'story.html' },
  contact: { label: 'Contact', href: 'contact.html' },
  artists: { label: 'Artists', href: 'artists.html' },
  retail: { label: 'Commerce', href: 'retail.html' }
};

function renderSiteNav(data, currentHref) {
  var navEl = document.getElementById('site-nav');
  if (!navEl) return;

  var navPages = (data && data.navPages) || [
    { id: 'home', kind: 'home', inMenu: true },
    { id: 'story', kind: 'story', inMenu: true },
    { id: 'contact', kind: 'contact', inMenu: true }
  ];
  var pages = (data && data.pages) || [];

  var html = '';
  navPages.forEach(function(entry) {
    if (!entry.inMenu) return;
    var label, href;
    if (entry.kind === 'custom') {
      var pg = pages.find(function(p) { return p.id === entry.id; });
      if (!pg || pg.visible === false) return;
      label = pg.title || 'Untitled';
      href = 'page.html?slug=' + encodeURIComponent(pg.slug || '');
    } else {
      var b = BESPOKE_NAV_PAGES[entry.kind];
      if (!b) return;
      label = b.label;
      href = b.href;
    }
    var isActive = currentHref === href;
    html += '<a href="' + href + '"' + (isActive ? ' class="active"' : '') + '>' + escapeNav(label) + '</a>';
  });

  if (html) navEl.innerHTML = html;
}

function escapeNav(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
