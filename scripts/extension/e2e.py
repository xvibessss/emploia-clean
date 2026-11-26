"""Test de bout en bout de l'extension Emploia dans un vrai Chrome.

Usage : python3 scripts/extension/e2e.py . /tmp/captures
(nécessite Playwright pour Python et un Chrome qui accepte --load-extension,
par exemple « Chrome for Testing » ; le Chrome grand public le refuse.)

- charge chrome-extension/ non empaquetée ;
- sert une page d'offre neutre (sans marque tierce) sous un domaine où le
  script de contenu s'exécute, et sert emploia.eu depuis les fichiers du dépôt ;
- clique « Adapter mon CV », vérifie que /app s'ouvre avec l'offre collée et
  que le fragment #offre= a été effacé de l'adresse ;
- produit les captures 1280x800 pour le Chrome Web Store.
"""
import json, os, re, sys, tempfile, pathlib
from playwright.sync_api import sync_playwright

REPO = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
EXT = REPO / 'chrome-extension'

rewrites = {r['source']: r['destination'] for r in json.load(open(REPO / 'vercel.json')).get('rewrites', []) if '(' not in r['source'] and ':' not in r['source']}

DESCRIPTION = (
    "<h3>Vos missions</h3><ul>"
    "<li>Piloter les campagnes d'acquisition payantes (Google Ads, Meta, LinkedIn)</li>"
    "<li>Construire les tableaux de bord de performance avec l'équipe data</li>"
    "<li>Lancer et analyser des tests A/B sur le site et l'onboarding</li>"
    "<li>Travailler le référencement naturel avec l'équipe contenu</li></ul>"
    "<h3>Profil recherché</h3><ul><li>2 à 4 ans d'expérience en growth ou marketing digital</li>"
    "<li>À l'aise avec SQL, GA4 et HubSpot</li><li>Anglais professionnel</li></ul>"
    "<h3>Avantages</h3><p>Télétravail 2 jours par semaine, tickets restaurant, mutuelle prise en charge à 100 %.</p>"
)
OFFRE_HTML = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Growth Marketing Manager — Atelier Lumen</title>
<script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@type": "JobPosting", "title": "Growth Marketing Manager",
 "hiringOrganization": {"@type": "Organization", "name": "Atelier Lumen"},
 "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Bordeaux"}},
 "employmentType": "FULL_TIME", "description": DESCRIPTION})}</script>
<style>body{{font-family:Inter,system-ui,sans-serif;background:#f6f6f4;margin:0;color:#1f2328}}
.top{{background:#fff;border-bottom:1px solid #e5e5e0;padding:18px 48px;font-weight:800;font-size:18px}}
.wrap{{max-width:880px;margin:36px auto;background:#fff;border:1px solid #e5e5e0;border-radius:14px;padding:36px 44px}}
h1{{margin:0 0 6px;font-size:30px}} .meta{{color:#5f6368;margin-bottom:22px}} .tag{{display:inline-block;background:#f1f0ec;border-radius:20px;padding:4px 12px;margin-right:6px;font-size:13px}}
h3{{margin:22px 0 8px}} li{{margin:5px 0;line-height:1.5}}</style></head>
<body><div class="top">Offres d'emploi</div><div class="wrap"><h1>Growth Marketing Manager</h1>
<div class="meta">Atelier Lumen · Bordeaux</div><span class="tag">CDI</span><span class="tag">Hybride</span><span class="tag">40–48 k€</span>
<div class="description">{DESCRIPTION}</div></div></body></html>"""

TYPES = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp'}

def servir_emploia(route, request):
    url = request.url
    path = re.sub(r'^https://emploia\.eu', '', url).split('?')[0].split('#')[0] or '/'
    if path.startswith('/api/'):
        corps = '{"error":"non connecté"}' if 'auth/me' in path else '{}'
        return route.fulfill(status=401 if 'auth/me' in path else 200, content_type='application/json', body=corps)
    fichier = rewrites.get(path, path)
    if fichier == '/':
        fichier = '/index.html'
    p = REPO / fichier.lstrip('/')
    if p.is_dir():
        p = p / 'index.html'
    if not p.exists() and (REPO / (fichier.lstrip('/') + '.html')).exists():
        p = REPO / (fichier.lstrip('/') + '.html')
    if not p.exists():
        return route.fulfill(status=404, body='')
    return route.fulfill(status=200, content_type=TYPES.get(p.suffix, 'application/octet-stream'), body=p.read_bytes())

def routeur(route, request):
    u = request.url
    if u.startswith('chrome-extension://'):
        return route.continue_()
    if u.startswith('https://www.hellowork.com/'):
        return route.fulfill(status=200, content_type='text/html', body=OFFRE_HTML)
    if u.startswith('https://emploia.eu/'):
        return servir_emploia(route, request)
    return route.fulfill(status=204, body='')  # pas de réseau sortant : polices, analytics…

echecs = 0
def check(nom, ok, detail=''):
    global echecs
    print(f"  {'✓' if ok else '✗'} {nom}{'' if ok or not detail else ' — ' + str(detail)}")
    if not ok:
        echecs += 1

with sync_playwright() as p:
    profil = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(profil, executable_path='/usr/bin/google-chrome', headless=False,
        args=['--headless=new', f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--no-first-run', '--lang=fr-FR'],
        viewport={'width': 1280, 'height': 800}, locale='fr-FR', bypass_csp=True)
    ctx.route('**/*', routeur)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
    ext_id = sw.url.split('/')[2]
    check('l’extension se charge (service worker actif)', bool(ext_id), sw.url)

    page = ctx.new_page()
    page.goto('https://www.hellowork.com/fr-fr/emplois/1.html')
    fab = page.locator('#emploia-fab')
    fab.wait_for(timeout=10000)
    check('le bouton apparaît sur la page d’offre', 'Adapter mon CV' in fab.inner_text(), fab.inner_text())
    page.screenshot(path=str(OUT / '1-bouton-sur-offre.png'))

    with ctx.expect_page(timeout=15000) as nouvelle:
        fab.click()
    app = nouvelle.value
    url_ouverte = app.url
    check('l’extension ouvre emploia.eu/app avec l’offre dans le fragment', url_ouverte.startswith('https://emploia.eu/app?source=extension#offre=Growth'), url_ouverte[:90])
    # Les onglets ouverts par une extension échappent à context.route : on
    # recharge la même adresse sur une route posée pour cet onglet, afin de
    # tester la version du dépôt de /app (la production n'a pas encore le
    # code qui lit #offre=).
    try: app.close()
    except Exception: pass
    app = ctx.new_page()
    app.route('**/*', routeur)
    app.goto(url_ouverte)
    app.wait_for_load_state('domcontentloaded')
    check('la page ouverte vient bien du dépôt', app.evaluate("[...document.scripts].some(x => x.textContent.includes('hashP'))"))
    app.wait_for_function("document.getElementById('jobInput') && document.getElementById('jobInput').value.length > 50", timeout=15000)
    valeur = app.eval_on_selector('#jobInput', 'e => e.value')
    check('le générateur s’ouvre sur emploia.eu/app', app.url.startswith('https://emploia.eu/app'), app.url)
    check('l’offre est collée avec son en-tête', valeur.startswith('Growth Marketing Manager — Atelier Lumen (Bordeaux)'), valeur[:80])
    check('la description complète est transmise', 'HubSpot' in valeur and 'mutuelle' in valeur)
    check('le fragment #offre= est effacé de l’adresse', '#offre=' not in app.url and 'offre=' not in app.url, app.url)
    app.wait_for_timeout(1200)
    app.evaluate("document.getElementById('jobInput').scrollIntoView({block:'center'})")
    app.wait_for_timeout(500)
    app.screenshot(path=str(OUT / '2-offre-collee-dans-emploia.png'))

    pop = ctx.new_page()
    pop.set_viewport_size({'width': 1280, 'height': 800})
    pop.goto(f'chrome-extension://{ext_id}/popup.html')
    pop.click('#btnShowForm')
    for sel, val in [('#inputFirst', 'Camille'), ('#inputLast', 'Martin'), ('#inputEmail', 'camille.martin@exemple.fr'), ('#inputPhone', '06 12 34 56 78'), ('#inputCity', 'Bordeaux'), ('#inputTitle', 'Chargée de marketing')]:
        pop.fill(sel, val)
    pop.click('#btnSave')
    pop.wait_for_timeout(600)
    stocke = pop.evaluate("new Promise(r => chrome.storage.local.get(['emploia_profile'], d => r(d.emploia_profile)))")
    check('le profil s’enregistre depuis la fenêtre (boutons branchés)', stocke and stocke.get('firstName') == 'Camille', stocke)
    check('la fenêtre affiche le profil enregistré', pop.is_visible('#stateProfile') and 'Camille Martin' in pop.inner_text('#pName'))
    # L'onglet de la fenêtre n'est pas une page d'offre : on reproduit ce que
    # etatDeLaPage() affiche quand PAGE_STATE répond { offre: true } (cas testé
    # par scripts/extension/content.test.mjs), pour une capture fidèle.
    pop.evaluate("""() => { document.getElementById('pageTitle').textContent = 'Offre détectée';
      document.getElementById('pageHint').textContent = 'Emploia l’ouvre dans le générateur, déjà collée.';
      document.getElementById('btnAdapt').disabled = false; document.querySelector('.popup-toast')?.remove(); }""")
    pop.wait_for_timeout(300)
    pop.screenshot(path=str(OUT / 'popup-brut.png'))
    ctx.close()

print(f"\n{'❌ ' + str(echecs) + ' échec(s)' if echecs else '✅ extension de bout en bout : OK'}")
sys.exit(1 if echecs else 0)
