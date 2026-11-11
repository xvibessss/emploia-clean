document.addEventListener('scroll',()=>{const h=document.documentElement;const el=document.getElementById('read-progress');if(el)el.style.width=Math.min((h.scrollTop/(h.scrollHeight-h.clientHeight))*100,100)+'%';});
async function submitNW(e,f){e.preventDefault();const btn=f.querySelector('.nw-btn');btn.disabled=true;btn.textContent='...';try{const r=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.querySelector('.nw-input').value,source:'blog'})});if(r.ok){f.style.display='none';f.nextElementSibling.style.display='block';}}catch{}btn.disabled=false;btn.textContent="S'abonner →";}

/* ── Gestionnaires d'événements ────────────────────────────────────────────
   Anciens attributs on* du HTML. Le balisage porte data-on-<événement>="nom" ;
   shared.js relie chaque nom à la fonction ci-dessous. `this` est l'élément,
   `event` l'événement, et `return false` annule l'action par défaut — comme
   dans un attribut on*. Ne pas remettre d'attribut on* : la CSP les bloque. */
EMP_H["navigator_clipboard_writeText_9aed"] = function (event) {
  navigator.clipboard.writeText('https://emploia.eu/blog/repondre-recruteur-linkedin');this.textContent='✓ Copié !';setTimeout(()=>this.textContent='🔗 Copier',2000)
};
