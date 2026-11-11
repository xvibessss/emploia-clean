/* ── Scroll progress bar ── */
(function(){
  var bar = document.getElementById('emp-scroll-prog');
  if(!bar) return;
  window.addEventListener('scroll', function(){
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (window.scrollY / h * 100) : 0) + '%';
  }, {passive:true});
})();

/* ── Nav scroll-aware ── */
(function(){
  var nav = document.querySelector('.emp-nav');
  if(!nav) return;
  window.addEventListener('scroll', function(){
    nav.classList.toggle('scrolled', window.scrollY > 80);
  }, {passive:true});
})();

/* ── Scroll reveal ── */
(function(){
  var els = document.querySelectorAll('.reveal');
  if(!els.length) return;
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  },{threshold:0.08,rootMargin:'0px 0px -32px 0px'});
  els.forEach(function(el){ io.observe(el); });
})();

/* ── Count-up + stat bar animate ── */
(function(){
  var stats = document.querySelectorAll('.emp-stat-item');
  if(!stats.length) return;
  var done = false;
  var io = new IntersectionObserver(function(entries){
    if(done || !entries.some(function(e){ return e.isIntersecting; })) return;
    done = true;
    io.disconnect();
    stats.forEach(function(item, idx){
      var el = item.querySelector('.val[data-count]');
      var bar = item.querySelector('.bar i');
      setTimeout(function(){
        if(bar) bar.classList.add('animated');
        if(!el) return;
        var target = parseFloat(el.dataset.count);
        var prefix = el.dataset.prefix || '';
        var suffix = el.dataset.suffix || '';
        var duration = 1100, start = performance.now();
        var isFloat = String(target).includes('.');
        requestAnimationFrame(function tick(now){
          var p = Math.min((now-start)/duration, 1);
          var eased = 1 - Math.pow(1-p, 3);
          el.textContent = prefix + (isFloat ? (target*eased).toFixed(1) : Math.round(target*eased)) + suffix;
          if(p < 1) requestAnimationFrame(tick);
        });
      }, idx * 120);
    });
  },{threshold:0.4});
  stats.forEach(function(el){ io.observe(el); });
})();

/* ── Typewriter hero ── */
(function(){
  var el = document.getElementById('twWord');
  if(!el) return;
  var words = ['Product Managers','Développeurs','Data Scientists','Designers','Marketeurs','Commerciaux','Reconversions'];
  var i = 0, ci = 0, deleting = false;
  function tick(){
    var word = words[i];
    if(!deleting){
      ci++;
      el.textContent = word.slice(0, ci);
      if(ci === word.length){ deleting = true; setTimeout(tick, 1800); return; }
      setTimeout(tick, 65);
    } else {
      ci--;
      el.textContent = word.slice(0, ci);
      if(ci === 0){ deleting = false; i = (i+1) % words.length; setTimeout(tick, 300); return; }
      setTimeout(tick, 35);
    }
  }
  setTimeout(tick, 1200);
})();

/* ── Hero kanban cards entrance ── */
(function(){
  var cards = document.querySelectorAll('.kcard');
  cards.forEach(function(c, i){
    setTimeout(function(){ c.classList.add('in'); }, 400 + i * 80);
  });
})();

/* ── Sticky CTA bar ── */
(function(){
  var bar = document.getElementById('stickyBar');
  var footer = document.querySelector('.emp-footer');
  if(!bar) return;
  var shown = false;
  window.addEventListener('scroll', function(){
    var scrolled = window.scrollY > window.innerHeight * 0.9;
    var nearFooter = footer && (footer.getBoundingClientRect().top < window.innerHeight + 80);
    var shouldShow = scrolled && !nearFooter;
    if(shouldShow && !shown){ bar.classList.add('visible'); shown = true; }
    else if(!shouldShow && shown){ bar.classList.remove('visible'); shown = false; }
  }, {passive:true});
})();

/* ── Newsletter submit ── */
function empNewsletterSubmit(e){
  e.preventDefault();
  var form = document.getElementById('newsletterForm');
  var email = form.querySelector('input').value;
  fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})})
    .catch(function(){});
  form.innerHTML = '<p style="color:var(--brand-green);font-weight:600;margin:0">✓ Merci ! Vous recevrez votre premier conseil cette semaine.</p>';
}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["document_getElementById_sticky_d38e"] = function (event) {
  document.getElementById('stickyBar').remove()
};
EMP_H["empNewsletterSubmit_event_48e8"] = function (event) {
  empNewsletterSubmit(event)
};
