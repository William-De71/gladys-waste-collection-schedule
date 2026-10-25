# Waste Collection Schedule

## Présentation

Cette intégration amène dans Gladys Assistant les dates de collecte des déchets de votre adresse : dans le calendrier de Gladys, en rappel la veille au soir, et dans un widget de tableau de bord avec les prochaines collectes.

Les dates viennent de [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule), la bibliothèque bien connue des utilisateurs de Home Assistant : près de 1 000 sources, communes et organismes de collecte d’une trentaine de pays, applications (Abfall.IO, Recycle!, ReCollect…) et n’importe quel lien de calendrier ICS. La bibliothèque tourne telle quelle dans le conteneur de l’intégration.

- **Calendrier** : un calendrier par source (« Collecte des déchets – Maison ») pour chaque utilisateur qui active l’intégration, avec un événement sur la journée par collecte et par type de déchet.
- **Widget** « Prochaines collectes » : les prochains jours de collecte, avec un bac de la bonne couleur pour chacun.
- **Scènes** : rappels la veille au soir et le matin d’une collecte, et actions pour lire la prochaine collecte ou mettre à jour les dates.

![Le widget « Prochaines collectes », avec un calendrier puis deux (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-waste-collection-schedule/main/docs/assets/widgets.fr.png)

**Transport : cloud.** Le conteneur interroge le site web ou l’API de votre source, depuis votre Gladys, toutes les 12 heures par défaut. Votre adresse (ou ce dont la source a besoin : une rue, un numéro, un lien de calendrier) est envoyée à cette source et à personne d’autre. Pour les quelques sources françaises qui demandent un code INSEE, la commune et son code postal (jamais la rue) sont aussi envoyés à [geo.api.gouv.fr](https://geo.api.gouv.fr), l’API publique de l’État, pour le trouver. Rien ne passe par un serveur de Gladys. L’intégration demande à lire les maisons de Gladys (permission de localisation) uniquement pour leur nom.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent (intégrations de calendriers).
- Votre Gladys accède à Internet.
- Une source pour votre adresse : la plupart des communes sont trouvées à partir de leur seul nom. Consultez la [liste des sources](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers), ou utilisez le bouton **Trouver une source** de la page de configuration. Pas de source pour votre commune ? Collez le lien de calendrier (`.ics`, `webcal://`) publié par votre mairie ou votre organisme de collecte dans **Lien ICS**.

## Configuration

Un administrateur configure les calendriers une fois, pour tout le foyer.

### Remplir un calendrier

1. Ouvrez **Intégrations → Waste Collection Schedule → Configuration**.
2. Dans **Calendrier 1**, remplissez :

| Champ                 | Quoi écrire                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Maison                | la maison de Gladys : son nom nomme le calendrier, le widget et les textes des scènes                         |
| Pays                  | le pays de l’adresse : la source y est cherchée                                                               |
| Commune               | votre commune : la source est trouvée à partir d’elle (par exemple Bordeaux, Besançon, Nantes)                |
| Code postal           | votre code postal, si la source le demande                                                                    |
| Rue, Numéro           | votre adresse, si la source la demande                                                                        |
| Source (facultatif)   | laissez vide ; voir plus bas quand la commune ne suffit pas                                                   |
| Lien ICS (facultatif) | un lien de calendrier de votre mairie, pour une commune sans source                                           |
| Paramètres avancés    | rarement utile : des paires `clé=valeur` séparées par des points-virgules, pour un paramètre sans champ dédié |

3. Enregistrez, puis appuyez sur **Tester les calendriers** : pour chaque calendrier, combien de dates et quels types de déchets la source a renvoyés, ou ce qui manque (« Grand Besançon Métropole a aussi besoin de : Rue »). Le code INSEE est trouvé automatiquement à partir de la commune.

Jusqu’à trois calendriers : une résidence secondaire, ou une deuxième source pour la même maison (la commune pour la plupart des bacs et un lien ICS pour le verre). Deux calendriers de la même maison affichent leur source entre parenthèses.

### Quand la commune ne suffit pas

Certaines communes sont desservies par un organisme dont le nom diffère de la commune (un village d’une métropole), et certains noms correspondent à plusieurs sources. **Tester les calendriers** le dit alors et liste les candidates. Saisissez votre commune ou votre organisme dans **Trouver une source** en bas de la page : la réponse liste les sources qui correspondent, ce que chacune demande (avec les noms des champs ci-dessus) et sa documentation. Recopiez le nom de la vôtre dans **Source**, par exemple `Grand Besançon Métropole` pour un village du Grand Besançon.

### Types de déchets, rappels et mises à jour

| Champ                                | Par défaut | Rôle                                                                                  |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------- |
| Renommer                             | vide       | paires `Original=Nouveau` séparées par des points-virgules : `Tri sélectif=Bac jaune` |
| Masquer                              | vide       | types à ignorer, séparés par des points-virgules : `Sapins de Noël; Encombrants`      |
| Rappel de la veille                  | 19 h       | heure des déclencheurs « Collecte des déchets demain », ou Désactivé                  |
| Rappel du matin                      | 6 h        | heure du déclencheur « Collecte des déchets aujourd’hui », ou Désactivé               |
| Mettre à jour les dates toutes les   | 12 heures  | fréquence d’interrogation des sources (6, 12 ou 24 heures)                            |
| Langue des textes envoyés aux scènes | Anglais    | noms de calendrier par défaut et messages d’erreur dans les variables de scène        |

Renommer et masquer s’appliquent à tous les calendriers. Les noms des calendriers suivent la langue de chaque utilisateur.

## Utilisation

### Mes calendriers

Chaque utilisateur qui veut les collectes dans son propre calendrier ouvre l’intégration et appuie sur **Activer pour moi** dans **Mes calendriers**. Un calendrier par source apparaît, avec un événement sur la journée par collecte et par type de déchet, de 35 jours en arrière à 400 jours devant. Les événements suivent la source : une collecte que la source déplace ou supprime est déplacée ou disparaît aussi dans Gladys.

Un calendrier commence privé. Activez **Partager avec le foyer** pour le montrer à tout le foyer et l’utiliser dans les scènes avec les déclencheurs calendrier de Gladys ; désactivez **Synchroniser ce calendrier** pour ne plus le recevoir. Le widget et les déclencheurs de l’intégration fonctionnent même si personne ne l’active.

### Widget

Dans l’éditeur de tableau de bord, ajoutez le widget **Prochaines collectes** depuis la section Waste Collection Schedule. Il montre la prochaine collecte, les prochains jours de collecte avec un bac de la bonne couleur (jaune pour le tri, bleu pour le papier, vert pour le verre et les déchets verts, marron pour les biodéchets, gris pour les ordures ménagères), l’état de chaque calendrier et un bouton **Actualiser**. Réglages : le calendrier affiché (tous, ou un seul), le nombre de jours de collecte (3, 5 ou 8) et le bouton Actualiser.

### Déclencheurs de scène

| Déclencheur                        | Quand                                                        | Variables                                                  |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Collecte des déchets demain        | la veille d’un jour de collecte, à l’heure du rappel du soir | types de déchets, nombre de types, date, nom du calendrier |
| Type de déchet collecté demain     | au même moment, une fois par type (pour filtrer sur un type) | type de déchet, date, nom du calendrier                    |
| Collecte des déchets aujourd’hui   | le matin d’un jour de collecte, à l’heure du rappel du matin | types de déchets, nombre de types, date, nom du calendrier |
| Échec de mise à jour des collectes | une fois, quand une source commence à échouer                | nom du calendrier, source, erreur                          |

Chaque déclencheur peut être filtré sur un calendrier. Un rappel n’est envoyé qu’une fois, même si Gladys redémarre ; si Gladys était éteint à l’heure du rappel, il arrive jusqu’à 3 heures plus tard.

### Actions de scène

- **Lire la prochaine collecte** (éventuellement d’un type de déchet, par exemple « verre ») : trouvée, date, jours restants, types de déchets, nom du calendrier. Utilisez « jours restants » dans une condition des étapes suivantes.
- **Mettre à jour les dates de collecte** : interroge les sources maintenant ; renvoie réussite, erreur, prochaine date, prochains types de déchets, jours avant la prochaine collecte.

### Exemples de scènes

- **Collecte des déchets demain** → envoyer un message « Demain : {{triggerEvent.data.waste_types}}, pensez à sortir les bacs ».
- **Type de déchet collecté demain**, type « Verre » → allumer la lumière de l’entrée en vert pendant 10 minutes.
- Un déclencheur calendrier de Gladys sur le calendrier partagé « Collecte des déchets – Maison », 30 minutes avant l’événement → un rappel au foyer.

## Dépannage

- **Aucune source trouvée** : vérifiez le pays, ou écrivez le nom de votre organisme de collecte dans **Source**, tel que le donne **Trouver une source**.
- **Plusieurs sources correspondent** : recopiez la bonne, parmi la liste du message, dans **Source**.
- **Il manque une valeur** : le message de **Tester les calendriers** nomme le champ à remplir ; un paramètre sans champ va dans **Paramètres avancés** sous la forme `clé=valeur`. Quand la source les connaît, le message propose les bonnes valeurs (noms de rues, communes).
- **Code INSEE** : commune introuvable, ou plusieurs communes du même nom : ajoutez le code postal.
- **La source a échoué** ou **a mis trop de temps** : le site de la source est en panne ou a changé, ou il ne trouve plus votre adresse. L’intégration réessaie après 15 minutes, puis de moins en moins souvent, et garde entre-temps les dernières dates connues. Si cela dure, vérifiez si la source fonctionne dans Home Assistant : sinon, signalez-le à [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues), la correction arrivera avec une mise à jour de l’intégration.
- **Dates fausses ou manquantes** : les dates sont celles de la source. Comparez avec le site de votre organisme de collecte, et signalez un écart en amont.
- **Pas de calendrier après l’activation** : les calendriers sont envoyés après la première mise à jour réussie des sources ; vérifiez que **Synchroniser ce calendrier** est activé.
- **Pas de rappel** : vérifiez les heures de rappel dans la configuration, et que la scène filtre sur le bon calendrier.
- **Journaux** : l’onglet **Journaux** de l’intégration. Pour plus de détails, ajoutez la variable d’environnement `DEBUG=gladys-integration-sdk`. Pour signaler un problème, ouvrez une [issue](https://github.com/William-De71/gladys-waste-collection-schedule/issues) avec les versions de Gladys et de l’intégration, la source et les journaux.
