# EmploiA — AGENTS.md

Contrat d'exécution pour les agents autonomes (Hermes Agent en boucle externe,
Claude Code en exécuteur). Chargé par Hermes depuis n'importe quel
sous-répertoire du repo (contrairement à `CLAUDE.md`, qui n'est lu que depuis le
répertoire courant).

> ⚠️ **Première action de toute session Hermes : lire `./CLAUDE.md`.**
> Hermes ne charge qu'un seul type de fichier de contexte : la présence de cet
> `AGENTS.md` **masque** `CLAUDE.md`, qui ne sera donc pas dans ton prompt
> système. Or `CLAUDE.md` contient les faits indispensables — état produit,
> architecture, design system, clés KV Upstash, blocages « humain seul ».
> Ouvre-le avec l'outil fichier avant d'agir. (Claude Code, lui, le charge
> nativement : rien à faire de son côté.)

Ce fichier-ci ne décrit que *comment* travailler, jamais *ce qu'est* le projet —
pour éviter deux sources de vérité qui divergent.

---

## Rôles

| Couche | Qui | Responsabilité |
|--------|-----|----------------|
| Boucle externe | Hermes Agent | triage du backlog, cron, mémoire inter-sessions, décision, délégation |
| Exécuteur | Claude Code | lecture/écriture de code, tests, git, sous-agents ECC |

Hermes n'édite pas le code lui-même quand la tâche dépasse une retouche
triviale : il délègue.

```
claude -p "<tâche précise, un seul objectif>" \
  --allowedTools 'Read,Edit,Bash' --max-turns 20
```
avec `workdir=/Users/chapellehugo/emploia-clean`. Pour un chantier lourd
(nouvelle capacité, refonte), passer par `/bonespipeline` plutôt que par un
`-p` unique.

## Sessions Hermes

- Toujours lancer `hermes` **depuis la racine du repo** : les sessions sont
  scopées au workspace, sinon `hermes -c` ne retrouve pas la conversation.
- Ne **jamais** reprendre en interactif (`hermes -c`) une session créée avec
  `hermes -z` : l'auto-approbation YOLO persiste dans la session et le backend
  terminal est `local`, non sandboxé.

## Garde-fous d'exécution

Autonomie large sur le code, arrêt net sur les effets externes.

**Autorisé sans demander** : lire, éditer, créer des branches, commits,
lancer les tests, ouvrir une PR.

**Stop — validation de Hugo obligatoire**, et sans exception en mode non
interactif (cron, `-z`) :

- `vercel --prod` / tout déploiement en production
- merge sur `main` d'une PR non relue
- toute action Stripe en mode live
- tout envoi sortant : emails Resend, invitations/messages LinkedIn
  (Phantombuster), notifications push
- suppression irréversible : données prod, clés KV, `reset --hard`, force-push

> Note : `CLAUDE.md` autorise « push + `vercel --prod` sans demander ». Cette
> règle vaut pour une session interactive où Hugo est devant l'écran. En
> exécution non surveillée, la règle ci-dessus prime.

## Secrets

- Aucun secret dans le repo (public sur GitHub). Les variables vivent sur
  Vercel, listées dans `CLAUDE.md`.
- Ne jamais écrire une valeur de token/clé dans une réponse, un log, un commit
  ou un message. Si un secret a fui, le signaler et demander sa rotation.
- Pas de credential sur une infra tierce : contrainte de souveraineté de Hugo.

## Vérifications avant de rendre la main

Les trois commandes que la CI exécute réellement (`.github/workflows/ci.yml`) :

```bash
node scripts/ci-guards.mjs        # 219 rewrites + 76 handlers api/
npm run bench                     # qualité des générations (anti-fabrication)
npm run test:employer             # cycle de vie des offres
```

Un rouge bloque la livraison — on corrige l'implémentation, pas l'assertion,
sauf si l'assertion est démontrablement fausse.

> ⚠️ Ne jamais reprendre une commande de test depuis un document sans l'avoir
> vue dans `package.json` ou dans `.github/workflows/`. `npm run check`,
> `npm run smoke`, `check.sh`, `smoke-test.mjs` et `dev-server.mjs` **n'existent
> pas** dans ce repo : ils viennent du snapshot périmé `EmploiA_extracted/` et
> ont déjà contaminé une mission (2026-09-29).

## Repères

- `CLAUDE.md` — état produit, archi, design system, blocages « humain seul »
- `SESSION_STATE.md` — état git de la session précédente, si présent
- `../claude code/EMPLOIA/EmploiA claude code/HUGO-TODO.md` — backlog et PR à relire
- `api/` — Edge Functions ; `shared.css` / `shared.js` — socle UI commun
