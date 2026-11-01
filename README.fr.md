# EDCH — Elite Dangerous Companion Helper

[English](README.md) · **Français** · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Compagnon léger pour **Elite Dangerous** (Windows). Il lit le journal du jeu en temps réel et, pour chaque matériau d'ingénierie, te dit **où le trouver, avec de vrais systèmes cliquables autour de toi**.

## ⚠️ À lire avant d'utiliser EDCH

**EDCH ne remplace pas les autres outils de la communauté.** C'est un projet indépendant, sans lien avec [EDMarketConnector](https://github.com/EDCD/EDMarketConnector), [Odyssey Materials Helper](https://github.com/jixxed/ed-odyssey-materials-helper), [EDEngineer](https://github.com/msarilar/EDEngineer), Inara, Spansh ni aucun autre projet. Il n'est pas non plus affilié à Frontier Developments. Si un de ces outils te convient, continue à l'utiliser : ils sont plus anciens, plus complets et éprouvés par des milliers de joueurs.

**EDCH a été codé en grande partie par une IA (Claude, d'Anthropic), avec le suivi d'un développeur** qui définit les fonctionnalités, teste et valide chaque version. L'outil peut donc être incomplet, contenir des bugs ou des données inexactes. Si tu en trouves, ouvre une [issue](../../issues).

**EDCH ne fonctionnerait pas sans le travail des autres.** Les données, les traductions et les recherches viennent de projets créés et maintenus bénévolement par des membres de la communauté : Spansh, EDDN et EDCD, EDSM, Inara, EDEngineer, Odyssey Materials Helper, Elite Dangerous Almanac, EDRefCard, EDSY, Coriolis… Si EDCH t'est utile, pense à les remercier, à les soutenir ou à contribuer à leurs projets. Le détail est dans [Crédits](#crédits) et dans le fichier [NOTICE](NOTICE).

![Fiche d'un matériau : échanges et systèmes en Boom/Expansion (données de démo)](docs/materials.png)

## Ce qu'il fait

- **Inventaire en direct** : matériaux bruts, manufacturés et encodés, rangés comme chez le trader (une ligne par famille, grades 1 à 5) avec la jauge de stockage. Le casier Odyssey (données, composants, objets, consommables) est lu depuis `ShipLocker.json`.
- **Où le trouver, avec des systèmes réels** : chaque condition d'apparition devient une recherche [Spansh](https://spansh.co.uk) autour de ta position.
  - HGE : systèmes peuplés en Boom/Expansion, Guerre, Troubles civils, Épidémie, Fédération ou Empire. Les états de faction trop vieux sont ignorés.
  - Émissions encodées selon la sécurité, zones de conflit, sillages haute énergie.
  - Planètes atterrissables classées par % du matériau brut, anneaux glacés ou vierges, sites Gardiens et Thargoid.
  - Installations Odyssey et sites de farm connus (Jameson, Dav's Hope, brain trees, cristaux…).
  - Clic sur un système : il est copié, prêt à coller dans la carte galactique. Liens Spansh et Inara à côté.
- **Trader de matériaux le plus proche** du bon type, avec des **suggestions d'échange** calculées sur ton stock (taux du jeu, en tenant compte de ce que ta wishlist réserve).
- **Ingénierie** : toutes les modifications, effets expérimentaux, synthèses, courtiers technologiques et améliorations Odyssey, avec ce que tu possèdes déjà.
- **Wishlist** : ajoute des modifications (grades, nombre de jets, quantité). Elle calcule ce qu'il manque et le meilleur échange pour le combler.
- **Ingénieurs** : statut et rang lus dans le journal, système copiable, distance, et conditions de déblocage cochées automatiquement quand le journal permet de les vérifier (casier Odyssey, soute, matériaux).
- **Import de build** : colle ou choisis un export **EDSY** ou **Coriolis** (SLEF ou Loadout JSON). Chaque module ingénié et son effet expérimental vont dans la wishlist. Tu peux aussi repartir de ton vaisseau actuel.
- **Recherche façon Inara** : où acheter ou vendre une marchandise (par prix ou par distance), un vaisseau, un module (classe et note) ou un service (Interstellar Factors, courtier technologique, trader…) autour de toi.
- **Navigation** : portée de saut de ton vaisseau (vide, plein, chargé, maintenant, cargaison simulée), itinéraire avec boost neutron via Spansh, et Fleet Carrier (sauts, tritium et durée, en estimation rapide ou en plan Spansh détaillé avec ravitaillements).
- **Commandes & contrôleurs** : lit tes raccourcis (préréglage actif, y compris des préréglages différents pour le vaisseau, le SRV et à pied) et dessine chaque périphérique. Le clavier est dessiné touche par touche (QWERTY, AZERTY ou QWERTZ) et la manette Xbox ou PlayStation avec des repères numérotés. Les HOTAS, joysticks et manettes reconnus (environ 45 modèles : VKB, Virpil, Thrustmaster, Saitek/Logitech, CH…) sont affichés sur la photo du modèle, avec l'action écrite dans la case de chaque bouton. Les gabarits viennent d'EDRefCard et sont chargés depuis son dépôt GitHub. Pour un modèle non reconnu, tu choisis le gabarit le plus proche ; sinon, un schéma simple en axes, chapeaux et boutons s'affiche. Chaque commande a sa légende et une couleur par mode, avec des filtres Vaisseau / SRV / À pied, une recherche et une fiche imprimable.
- **Sauvegarde de la configuration** : exporte tes raccourcis (et tes réglages graphiques) en zip dans Documents\EDCH, et les restaure en un clic. Ta configuration actuelle est sauvegardée automatiquement avant chaque import.
- **Missions** : chaque mission en cours avec son objectif, sa destination, le temps restant et sa progression ; les missions de massacre empilées avec les éliminations qu'il reste par faction donneuse.
- Pour les missions d'approvisionnement et de minage, où se procurer la marchandise : stations classées selon le prix, la distance et la fraîcheur des données du marché, avec le bénéfice estimé, et les points chauds les plus proches pour les missions de minage.
- **Missions d'escadrille partagées** : les membres de l'escadrille qui utilisent EDCH saisissent le même code et voient qui a accepté quelle mission partagée : tu choisis les missions à partager (ou toutes automatiquement). Les messages passent par ntfy.sh, chiffrés de bout en bout avec ce code. Un son et/ou une languette qui clignote sur le côté (pas de fenêtre Windows) te préviennent quand quelqu'un a une mission que tu n'as pas, ou quand toute l'escadrille l'a acceptée.
- **Colonisation** : chaque dépôt de construction avec ce qu'il reste à livrer, ce que tu as en soute, le nombre de trajets et une recherche en un clic pour savoir où acheter chaque marchandise.
- **Objectifs communautaires** : ta contribution, ta tranche de récompense et le palier des objectifs que tu as rejoints ; tous les objectifs en cours via Inara avec ta clé API.
- **Exploration** : valeur des données cartographiques non vendues, aide aux prélèvements d'exobiologie (distance aux prélèvements précédents comparée à la portée de la colonie), espèces possibles et valeurs pour chaque planète à signaux biologiques, analyses non vendues.
- **Minage** : résultats des prospecteurs en direct avec alertes pour tes cibles et les cœurs, tonnage de la session ; une recherche façon Merit Miner pour savoir où miner et vendre dans les systèmes de ta puissance.
- **Powerplay et session** : mérites de la semaine et de la session, état Powerplay du système actuel ; crédits gagnés par activité depuis ta connexion.
- **Accès mobile** : ouvre EDCH sur ton téléphone ou ta tablette en scannant un QR code. Un serveur local (désactivé par défaut) sert l'appli sur ton réseau. Seuls les appareils qui ont scanné le QR code y accèdent : l'IP du PC ne suffit pas. « Nouveau code » déconnecte tous les appareils. L'interface s'adapte au téléphone (navigation en bas, panneaux plein écran), et les modifications de la wishlist faites sur le téléphone reviennent sur le PC.
- **Mises à jour automatiques** : EDCH vérifie sur GitHub si une nouvelle version existe, affiche un bandeau, télécharge l'installateur à ta demande (somme de contrôle vérifiée) et se relance pour terminer. Désactivable dans les Paramètres.
- **Synchro façon EDMC** : envoi en direct vers **EDDN** (marchés, équipements, chantiers navals, sauts, scans, routes), **EDSM** et **Inara** (avec ta clé API). Les règles d'EDDN sont respectées : données personnelles retirées, position recoupée, aucun renvoi d'un message refusé, rien de l'historique.

![Un VKB Gladiator avec ses raccourcis (raccourcis de démo)](docs/controls.png)

## Données et vie privée

EDCH lit le journal du jeu sur ton PC. Voici tout ce qui en sort, et vers où :

- **Spansh** : tes recherches (système, matériau, marchandise…) et ta position comme point de départ.
- **EDDN** (activé par défaut, comme EDMC ; désactivable dans Synchro) : marchés, équipement, chantiers, sauts et scans, sans tes données personnelles, comme EDDN l'exige.
- **EDSM et Inara** : rien tant que tu n'as pas saisi ta propre clé API dans Synchro. Tes clés restent sur ton PC.
- **ntfy.sh** (seulement si tu actives le partage d'escadrille) : tes missions d'escadrille, chiffrées avec le code de l'escadrille avant de quitter ton PC.
- **GitHub** : seulement pour vérifier si une nouvelle version existe (désactivable dans les Paramètres).
- **Accès mobile** : reste sur ton réseau local ; désactivé par défaut et protégé par le QR code.

Rien d'autre n'est collecté ni envoyé. Tes réglages, clés et wishlist sont stockés dans `%LOCALAPPDATA%\EDCompanionHelper`.

## Langues

EDCH est disponible dans les six langues du jeu : anglais (par défaut), français, allemand, espagnol, portugais (Brésil) et russe. L'installateur demande la langue et l'appli la reprend au premier lancement. Tu peux la changer à tout moment dans **Paramètres → Langue**. Les noms des matériaux, modules, plans et effets suivent la traduction du jeu ; les noms des commandes restent ceux du jeu en anglais.

Pour ajouter ou corriger une traduction, modifie `tools/translations_*.txt` (une ligne par texte : `fr ¦ en ¦ de ¦ es ¦ pt ¦ ru`), puis lance `python3 tools/gen_locales.py`.

## Installer

Télécharge l'installateur (`.exe` ou `.msi`) dans les [Releases](../../releases), ou la version portable `EDCH_<version>_x64-portable.exe` : rien à installer, lance-la depuis n'importe quel dossier (elle te prévient quand une nouvelle version sort et ouvre la page de la release). Windows 10/11 a déjà WebView2.

EDCH garde des logs de ce qu'il fait (Paramètres → Logs de l'application, avec un bouton pour ouvrir le dossier). Un mode debug écrit un log détaillé séparé, à joindre à un signalement de bug.

L'installateur n'est pas signé numériquement (un certificat coûte cher pour un outil gratuit) : Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » la première fois. Clique sur **Informations complémentaires**, puis **Exécuter quand même**. Les mises à jour suivantes sont proposées directement dans EDCH.

Au premier lancement, le dossier du journal est détecté tout seul (`%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`). Tu peux le changer dans **Paramètres**.

## Développer

Prérequis : Node 20+, Rust stable, et les [prérequis Tauri](https://tauri.app/start/prerequisites/) pour Windows.

```bash
npm install
npm test            # compile l'interface et lance les tests (journal, échanges, requêtes Spansh, EDDN, raccourcis)
npm run app:dev     # lance l'appli
npm run app:build   # installateurs Windows dans src-tauri/target/release/bundle
npm run demo        # interface seule dans un navigateur, avec un journal d'exemple
```

Structure :

- `src-tauri/` : backend Rust (lecture du journal, fichiers JSON du jeu, appels HTTP, fichiers d'options et zips, ouverture de liens). Il ne contient aucune logique de jeu.
- `src/` : interface en TypeScript sans framework.
  - `journal.ts` : état du commandant à partir des événements du journal.
  - `sources.ts` : conditions d'apparition transformées en recherches.
  - `spansh.ts` : appels et mise en forme des résultats.
  - `trade.ts` : taux du trader de matériaux.
  - `eddn.ts`, `uploaders.ts` : messages EDDN, EDSM et Inara.
  - `binds.ts` : fichiers `.binds` et noms des périphériques.
  - `i18n.ts` : couche de traduction.
- `tools/gen_data.py`, `tools/gen_binds.py`, `tools/gen_locales.py` : régénèrent les données de `public/` (voir NOTICE).

Un build Windows se lance à chaque push sur `main`. Pour publier une version, pousse un tag comme `v0.8.5` : la Release est publiée et les copies installées proposent la mise à jour.

## Feuille de route

- Connexion Frontier (cAPI, OAuth) pour la flotte, le stock et le Fleet Carrier : il faut un Client ID Frontier.
- EDDN : schémas restants (codexentry, approachsettlement, fssbodysignals, fsssignaldiscovered…).
- Itinéraire de farm optimisé pour la wishlist.

## Crédits

Données : EDCD/FDevIDs et msarilar/EDEngineer (MIT), via dseelinger/d47 (MIT). Noms du jeu traduits : Elite Dangerous Almanac (MIT) et EDEngineer. Noms des commandes et gabarits des périphériques : EDRefCard (Richard Buckle, MIT). Recherches : Spansh (EDDN). Elite Dangerous est une marque de Frontier Developments plc. Outil communautaire non officiel et non commercial. Détails dans [NOTICE](NOTICE).
