"""Arrivée sur /app depuis le bouton « Générer mon CV » d'une alerte, dans un vrai Chrome.

Usage : python3 scripts/alertes/lien-app.e2e.py .
Connecté avec un parcours enregistré : l'offre est collée et la génération part.
Sans compte : l'offre est collée et le champ parcours prend le focus.
"""
import json, re, sys, pathlib
from playwright.sync_api import sync_playwright
REPO = pathlib.Path(sys.argv[1]).resolve()
rewrites = {r['source']: r['destination'] for r in json.load(open(REPO/'vercel.json')).get('rewrites', []) if '(' not in r['source'] and ':' not in r['source']}
TYPES = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}
FICHE = {'texte': 'Comptable confirmé — Cabinet Durand (Lyon)\n\nTenue de la comptabilité générale, TVA, clôtures.', 'url': 'https://x.test/1'}
def lancer(connecte):
    appels = []
    def routeur(route, req):
        u = req.url
        if not u.startswith('https://emploia.eu/'): return route.fulfill(status=204, body='')
        path = u[len('https://emploia.eu'):].split('?')[0] or '/'
        if path.startswith('/api/'):
            appels.append(path)
            if path == '/api/offre': return route.fulfill(status=200, content_type='application/json', body=json.dumps(FICHE))
            if path == '/api/auth/me':
                if connecte: return route.fulfill(status=200, content_type='application/json', body=json.dumps({'user': {'email':'c@x.fr','name':'Camille','plan':'free','generationsUsed':1}}))
                return route.fulfill(status=401, content_type='application/json', body='{}')
            if path == '/api/generate/cv': return route.fulfill(status=200, content_type='application/json', body=json.dumps({'result':'CV généré'}))
            return route.fulfill(status=200, content_type='application/json', body='{}')
        f = rewrites.get(path, path); f = '/index.html' if f == '/' else f; p = REPO/f.lstrip('/')
        if not p.exists(): return route.fulfill(status=404, body='')
        return route.fulfill(status=200, content_type=TYPES.get(p.suffix,'application/octet-stream'), body=p.read_bytes())
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
        ctx = b.new_context(bypass_csp=True, locale='fr-FR')
        ctx.route('**/*', routeur)
        pg = ctx.new_page()
        pg.goto('https://emploia.eu/')
        if connecte: pg.evaluate("localStorage.setItem('emploia_profile_text', 'Comptable depuis 4 ans en cabinet, maîtrise de Sage et Cegid, clôtures mensuelles et annuelles, déclarations de TVA, relation clients.')")
        pg.goto('https://emploia.eu/app?source=alerte&offre_id=az_1000&auto=1')
        pg.wait_for_function("() => document.getElementById('jobInput').value.length > 10", timeout=10000)
        pg.wait_for_timeout(4500)
        r = {'offre': pg.eval_on_selector('#jobInput','e=>e.value')[:45], 'url': pg.url, 'generation': '/api/generate/cv' in appels, 'focus': pg.evaluate("document.activeElement && document.activeElement.id")}
        b.close(); return r
for connecte in (True, False):
    print('connecté' if connecte else 'anonyme', lancer(connecte))
